#!/usr/bin/env python3

import argparse
import asyncio
import websockets
import json
import random
import sys

parser = argparse.ArgumentParser(description='Run the taiko-web multiplayer server.')
parser.add_argument('port', type=int, metavar='PORT', nargs='?', default=34802, help='Port to listen on.')
parser.add_argument('-b', '--bind-address', default='localhost', help='Bind server to address.')
parser.add_argument('-o', '--allow-origin', action='append', help='Limit incoming connections to the specified origin. Can be specified multiple times.')
args = parser.parse_args()

MAX_SESSION_PLAYERS = 4

server_status = {
	"waiting": {},
	"users": [],
	"invites": {}
}
consonants = "bcdfghjklmnpqrstvwxyz"

def msgobj(msg_type, value=None):
	if value == None:
		return json.dumps({"type": msg_type})
	else:
		return json.dumps({"type": msg_type, "value": value})

def status_event():
	value = []
	for id, userDiff in server_status["waiting"].items():
		value.append({
			"id": id,
			"diff": userDiff["diff"]
		})
	return msgobj("users", value)

def get_invite():
	return "".join([random.choice(consonants) for x in range(5)])

def room_connected(room):
	return [member for member in room["members"] if "ws" in member]

def room_roster(room):
	return [{
		"player": member["player"],
		"name": member["name"],
		"don": member["don"]
	} for member in room_connected(room)]

def tag_seat(value, seat):
	if type(value) is dict:
		value["player"] = seat
		return value
	return {"player": seat, "value": value}

def next_seat(room):
	seat = 1
	for member in room["members"]:
		if member["player"] >= seat:
			seat = member["player"] + 1
	return seat

async def send_msgs(pairs):
	if pairs:
		await asyncio.gather(*[ws.send(msg) for ws, msg in pairs], return_exceptions=True)

async def notify_status():
	ready_users = [user for user in server_status["users"] if "ws" in user and user["action"] == "ready"]
	if ready_users:
		sent_msg = status_event()
		await send_msgs([(user["ws"], sent_msg) for user in ready_users])

async def broadcast_room(room, msg_type, value=None, exclude=None, only_actions=None):
	sent_msg = msgobj(msg_type, value)
	pairs = []
	for member in room_connected(room):
		if member is exclude:
			continue
		if only_actions and member["action"] not in only_actions:
			continue
		pairs.append((member["ws"], sent_msg))
	await send_msgs(pairs)

async def room_players(room):
	await broadcast_room(room, "players", room_roster(room))

async def session_waiting_event(room):
	value = []
	for member in room_connected(room):
		if member["action"] == "waiting" and "gameid" in member and "gamediff" in member:
			value.append({
				"id": member["gameid"],
				"diff": member["gamediff"],
				"player": member["player"]
			})
	await broadcast_room(room, "users", value)

async def cancel_loading(room, exclude=None):
	reset = [member for member in room_connected(room) if member is not exclude and member["action"] in ("loading", "loaded")]
	for member in reset:
		member["action"] = "songsel"
		if "gamediff" in member:
			del member["gamediff"]
		if "gameid" in member:
			del member["gameid"]
	if reset:
		await send_msgs([(member["ws"], msgobj("loadcancel")) for member in reset])
		await session_waiting_event(room)

async def close_room(room, exclude=None):
	for member in room["members"]:
		member["action"] = "ready"
		member["session"] = False
		member["room"] = None
		if "gamediff" in member:
			del member["gamediff"]
		if "gameid" in member:
			del member["gameid"]
	code = room.get("code")
	if code and code in server_status["invites"]:
		del server_status["invites"][code]
	end_msg = msgobj("gameend")
	status_msg = status_event()
	pairs = []
	for member in room_connected(room):
		if member is exclude:
			continue
		pairs.append((member["ws"], end_msg))
		pairs.append((member["ws"], status_msg))
	room["members"].clear()
	await send_msgs(pairs)

async def connection(ws, path):
	# User connected
	user = {
		"ws": ws,
		"action": "ready",
		"session": False,
		"room": None,
		"name": None,
		"don": None
	}
	server_status["users"].append(user)
	try:
		# Notify user about other users
		await ws.send(status_event())
		while True:
			try:
				message = await asyncio.wait_for(ws.recv(), timeout=10)
			except asyncio.TimeoutError:
				# Keep user connected
				pong_waiter = await ws.ping()
				try:
					await asyncio.wait_for(pong_waiter, timeout=10)
				except asyncio.TimeoutError:
					# Disconnect
					break
			except websockets.exceptions.ConnectionClosed:
				# Connection closed
				break
			else:
				# Message received
				try:
					data = json.loads(message)
				except json.decoder.JSONDecodeError:
					data = {}
				action = user["action"]
				msg_type = data["type"] if "type" in data else None
				value = data["value"] if "value" in data else None
				if action == "ready":
					# Not playing or waiting
					if msg_type == "join":
						if value == None:
							continue
						waiting = server_status["waiting"]
						id = value["id"] if "id" in value else None
						diff = value["diff"] if "diff" in value else None
						user["name"] = value["name"] if "name" in value else None
						user["don"] = value["don"] if "don" in value else None
						if not id or not diff:
							continue
						if id not in waiting:
							# Wait for another user
							user["action"] = "waiting"
							user["gameid"] = id
							user["gamediff"] = diff
							waiting[id] = {
								"user": user,
								"diff": diff
							}
							await ws.send(msgobj("waiting"))
						else:
							# Join the other user and start game
							other = waiting[id]["user"]
							waiting_diff = waiting[id]["diff"]
							del waiting[id]
							if "ws" in other:
								room = {"code": None, "session": False, "members": [other, user]}
								other["room"] = room
								user["room"] = room
								other["player"] = 1
								user["player"] = 2
								other["action"] = "loading"
								user["action"] = "loading"
								other["gamediff"] = waiting_diff
								user["gamediff"] = diff
								roster = [
									{"player": 1, "name": other["name"], "don": other["don"]},
									{"player": 2, "name": user["name"], "don": user["don"]}
								]
								await send_msgs([
									(ws, msgobj("gameload", {"player": 2, "players": [{"player": 1, "diff": waiting_diff}]})),
									(other["ws"], msgobj("gameload", {"player": 1, "players": [{"player": 2, "diff": diff}]})),
									(ws, msgobj("players", roster)),
									(other["ws"], msgobj("players", roster))
								])
							else:
								# Wait for another user
								user["action"] = "waiting"
								user["gameid"] = id
								user["gamediff"] = diff
								waiting[id] = {
									"user": user,
									"diff": diff
								}
								await ws.send(msgobj("waiting"))
						# Update others on waiting players
						await notify_status()
					elif msg_type == "invite":
						if value and "id" in value and value["id"] == None:
							# Session invite link requested
							if user["room"]:
								continue
							invite = get_invite()
							room = {"code": invite, "session": True, "members": [user]}
							server_status["invites"][invite] = room
							user["action"] = "invite"
							user["session"] = invite
							user["room"] = room
							user["player"] = 1
							user["name"] = value["name"] if "name" in value else None
							user["don"] = value["don"] if "don" in value else None
							await ws.send(msgobj("invite", invite))
							await room_players(room)
						elif value and "id" in value and value["id"] in server_status["invites"]:
							# Join a session with other users
							room = server_status["invites"][value["id"]]
							user["name"] = value["name"] if "name" in value else None
							user["don"] = value["don"] if "don" in value else None
							if len(room_connected(room)) < MAX_SESSION_PLAYERS:
								seat = next_seat(room)
								user["action"] = "invite"
								user["session"] = value["id"]
								user["room"] = room
								user["player"] = seat
								room["members"].append(user)
								await send_msgs([(m["ws"], msgobj("session", {"player": m["player"]})) for m in room_connected(room)])
								await room_players(room)
								await session_waiting_event(room)
							else:
								# Session is full
								await ws.send(msgobj("gameend"))
						else:
							# Session code is invalid
							await ws.send(msgobj("gameend"))
				elif action == "waiting" or action == "loading" or action == "loaded":
					# Waiting for other users to pick a song / load
					room = user["room"]
					if msg_type == "leave":
						if room and room["session"]:
							# Stop loading, return to song select
							user["action"] = "songsel"
							if "gamediff" in user:
								del user["gamediff"]
							if "gameid" in user:
								del user["gameid"]
							await ws.send(msgobj("left"))
							await cancel_loading(room, exclude=user)
							await session_waiting_event(room)
						elif room:
							# Quick match: abort the pair
							user["action"] = "ready"
							user["room"] = None
							if "gamediff" in user:
								del user["gamediff"]
							if "gameid" in user:
								del user["gameid"]
							if user in room["members"]:
								room["members"].remove(user)
							await send_msgs([
								(ws, msgobj("left")),
								(ws, status_event())
							])
							await close_room(room)
						else:
							# Waiting in the quick match pool
							user["action"] = "ready"
							if "gameid" in user and user["gameid"] in server_status["waiting"]\
								and server_status["waiting"][user["gameid"]]["user"] is user:
								del server_status["waiting"][user["gameid"]]
							if "gameid" in user:
								del user["gameid"]
							if "gamediff" in user:
								del user["gamediff"]
							await send_msgs([
								(ws, msgobj("left")),
								(ws, status_event())
							])
							await notify_status()
					elif action == "loading" and msg_type == "gamestart":
						user["action"] = "loaded"
						if room:
							members = room_connected(room)
							if len(members) >= 2 and all(member["action"] == "loaded" for member in members):
								for member in members:
									member["action"] = "playing"
								await broadcast_room(room, "gamestart")
				elif action == "playing":
					# Playing with other users
					room = user["room"]
					if room and room_connected(room):
						if msg_type == "note"\
							or msg_type == "drumroll"\
							or msg_type == "branch"\
							or msg_type == "gameresults":
							await broadcast_room(room, msg_type, tag_seat(value, user["player"]), exclude=user)
						elif msg_type == "songsel" and room["session"]:
							for member in room_connected(room):
								member["action"] = "songsel"
								if "gamediff" in member:
									del member["gamediff"]
								if "gameid" in member:
									del member["gameid"]
							await broadcast_room(room, "songsel")
							await broadcast_room(room, "users", [])
						elif msg_type == "gameend":
							# User wants to disconnect
							await close_room(room)
					else:
						# Other users disconnected
						user["action"] = "ready"
						user["session"] = False
						user["room"] = None
						await send_msgs([
							(ws, msgobj("gameend")),
							(ws, status_event())
						])
				elif action == "invite":
					room = user["room"]
					if msg_type == "leave" or msg_type == "gameend":
						reply = "gameend" if msg_type == "gameend" else "left"
						if room and user["player"] == 1:
							# Host cancels the session invite
							await close_room(room, exclude=user)
							user["action"] = "ready"
							user["session"] = False
							user["room"] = None
							await send_msgs([
								(ws, msgobj(reply)),
								(ws, status_event())
							])
						elif room:
							# Non-host leaves the session lobby
							if user in room["members"]:
								room["members"].remove(user)
							user["action"] = "ready"
							user["session"] = False
							user["room"] = None
							await send_msgs([
								(ws, msgobj(reply)),
								(ws, status_event())
							])
							await room_players(room)
							await session_waiting_event(room)
						else:
							user["action"] = "ready"
							user["session"] = False
							await send_msgs([
								(ws, msgobj(reply)),
								(ws, status_event())
							])
					elif msg_type == "songsel" and room and user["player"] == 1 and len(room_connected(room)) >= 2:
						# Host starts the session for everyone
						for member in room_connected(room):
							member["action"] = "songsel"
						code = room.get("code")
						if code and code in server_status["invites"]:
							del server_status["invites"][code]
						await broadcast_room(room, "songsel")
						await broadcast_room(room, "users", [])
				elif action == "songsel":
					# Session song selection
					room = user["room"]
					if room and len(room_connected(room)) >= 2:
						if msg_type == "songsel" or msg_type == "catjump":
							# Change song select position
							if type(value) is dict:
								value["player"] = user["player"]
								await broadcast_room(room, msg_type, value, only_actions=("songsel",))
						elif msg_type == "crowns":
							await broadcast_room(room, "crowns", {"player": user["player"], "scores": value}, exclude=user, only_actions=("songsel",))
						elif msg_type == "getcrowns":
							await broadcast_room(room, "getcrowns", value, exclude=user, only_actions=("songsel",))
						elif msg_type == "join":
							# Pick a song
							if value == None:
								continue
							id = value["id"] if "id" in value else None
							diff = value["diff"] if "diff" in value else None
							if not id or not diff:
								continue
							user["action"] = "waiting"
							user["gameid"] = id
							user["gamediff"] = diff
							await session_waiting_event(room)
							members = room_connected(room)
							if len(members) >= 2 and all(member["action"] == "waiting" for member in members):
								# Everyone picked a song, start loading
								for member in members:
									member["action"] = "loading"
								pairs = []
								for member in members:
									peers = [{
										"player": other["player"],
										"diff": other["gamediff"]
									} for other in members if other is not member]
									pairs.append((member["ws"], msgobj("gameload", {
										"player": member["player"],
										"players": peers
									})))
								await send_msgs(pairs)
						elif msg_type == "gameend":
							# User wants to disconnect
							await close_room(room)
					else:
						# Other users disconnected
						if room:
							if user in room["members"]:
								room["members"].remove(user)
							if not room_connected(room):
								code = room.get("code")
								if code and code in server_status["invites"]:
									del server_status["invites"][code]
								room["members"].clear()
						user["action"] = "ready"
						user["session"] = False
						user["room"] = None
						await send_msgs([
							(ws, msgobj("gameend")),
							(ws, status_event())
						])
	finally:
		# User disconnected
		del user["ws"]
		if user in server_status["users"]:
			del server_status["users"][server_status["users"].index(user)]
		room = user["room"]
		if room:
			if user in room["members"]:
				room["members"].remove(user)
			if user["action"] in ("waiting", "loading", "loaded"):
				await cancel_loading(room, exclude=user)
			members = room_connected(room)
			if not members:
				code = room.get("code")
				if code and code in server_status["invites"]:
					del server_status["invites"][code]
				room["members"].clear()
			elif not room["session"]:
				# Quick match: any disconnect ends the game
				await close_room(room)
			elif user["player"] == 1 and user["action"] == "invite":
				# Host left the session lobby before it started
				await close_room(room)
			else:
				# Keep playing without the disconnected user (frozen lane)
				if len(members) < 2 and any(member["action"] in ("waiting", "loading", "loaded") for member in members):
					await cancel_loading(room)
				await room_players(room)
				if room["session"]:
					await session_waiting_event(room)
		if user["action"] == "waiting" and "gameid" in user:
			if user["gameid"] in server_status["waiting"]\
				and server_status["waiting"][user["gameid"]]["user"] is user:
				del server_status["waiting"][user["gameid"]]
			await notify_status()

async def main():
	print('Starting server on port %d' % args.port, flush=True)
	async with websockets.serve(connection, args.bind_address, args.port, origins=args.allow_origin):
		await asyncio.Future()

try:
	asyncio.run(main())
except KeyboardInterrupt:
	print("Stopping server")
