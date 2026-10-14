class P2Connection{
	constructor(...args){
		this.init(...args)
	}
	init(){
		this.closed = true
		this.lastMessages = {}
		this.peers = {}
		this.player = 1
		this.allEvents = new Map()
		this.addEventListener("message", this.message.bind(this))
		this.currentHash = ""
		this.disabled = 0
		pageEvents.add(window, "hashchange", this.onhashchange.bind(this))
	}
	peerSeats(){
		return Object.keys(this.peers).map(Number).sort((a, b) => a - b)
	}
	getPeer(seat){
		return this.peers[seat]
	}
	primarySeat(){
		var seats = this.peerSeats()
		return seats.length ? seats[0] : null
	}
	primaryPeer(){
		var seat = this.primarySeat()
		return seat === null ? null : this.peers[seat]
	}
	get name(){
		var peer = this.primaryPeer()
		return peer ? peer.name : null
	}
	get don(){
		var peer = this.primaryPeer()
		return peer ? peer.don : null
	}
	get results(){
		var peer = this.primaryPeer()
		return peer ? peer.results : false
	}
	get otherConnected(){
		return this.peerSeats().length > 0
	}
	ensurePeer(seat){
		if(!this.peers[seat]){
			this.peers[seat] = this.newPeer()
		}
		return this.peers[seat]
	}
	newPeer(){
		return {
			name: null,
			don: null,
			notes: [],
			drumrollPace: 45,
			dai: 2,
			kaAmount: 0,
			results: false,
			branch: "normal",
			branchSet: false
		}
	}
	resetPeers(){
		for(var seat in this.peers){
			var peer = this.peers[seat]
			peer.notes = []
			peer.drumrollPace = 45
			peer.dai = 2
			peer.kaAmount = 0
			peer.results = false
			peer.branch = "normal"
			peer.branchSet = false
		}
	}
	clearPeers(){
		this.peers = {}
	}
	addEventListener(type, callback){
		var addedType = this.allEvents.get(type)
		if(!addedType){
			addedType = new Set()
			this.allEvents.set(type, addedType)
		}
		return addedType.add(callback)
	}
	removeEventListener(type, callback){
		var addedType = this.allEvents.get(type)
		if(addedType){
			return addedType.delete(callback)
		}
	}
	open(){
		if(this.closed && !this.disabled){
			this.closed = false
			var wsProtocol = location.protocol == "https:" ? "wss:" : "ws:"
			this.socket = new WebSocket(gameConfig.multiplayer_url ? gameConfig.multiplayer_url : wsProtocol + "//" + location.host + location.pathname + "p2")
			pageEvents.race(this.socket, "open", "close").then(response => {
				if(response.type === "open"){
					return this.openEvent()
				}
				return this.closeEvent()
			})
			pageEvents.add(this.socket, "message", this.messageEvent.bind(this))
		}
	}
	openEvent(){
		var addedType = this.allEvents.get("open")
		if(addedType){
			addedType.forEach(callback => callback())
		}
	}
	close(){
		if(!this.closed){
			this.closed = true
			if(this.socket){
				this.socket.close()
			}
		}
	}
	closeEvent(){
		this.removeEventListener(onmessage)
		this.clearPeers()
		this.session = false
		if(this.hashLock){
			this.hash("")
			this.hashLock = false
		}
		if(!this.closed){
			setTimeout(() => {
				if(this.socket.readyState !== this.socket.OPEN){
					this.open()
				}
			}, 500)
			pageEvents.send("p2-disconnected")
		}
		var addedType = this.allEvents.get("close")
		if(addedType){
			addedType.forEach(callback => callback())
		}
	}
	send(type, value){
		if(this.socket.readyState === this.socket.OPEN){
			if(typeof value === "undefined"){
				this.socket.send(JSON.stringify({type: type}))
			}else{
				this.socket.send(JSON.stringify({type: type, value: value}))
			}
		}else{
			pageEvents.once(this, "open").then(() => {
				this.send(type, value)
			})
		}
	}
	messageEvent(event){
		try{
			var response = JSON.parse(event.data)
		}catch(e){
			var response = {}
		}
		this.lastMessages[response.type] = response
		var addedType = this.allEvents.get("message")
		if(addedType){
			addedType.forEach(callback => callback(response))
		}
	}
	getMessage(type){
		if(type in this.lastMessages){
			return this.lastMessages[type]
		}
	}
	clearMessage(type){
		if(type in this.lastMessages){
			this.lastMessages[type] = null
		}
	}
	message(response){
		switch(response.type){
			case "gameload":
				if(response.value && "player" in response.value){
					this.player = response.value.player
				}
			case "gamestart":
				this.resetPeers()
				this.hadResults = false
				break
			case "gameend":
				this.clearPeers()
				if(this.session){
					pageEvents.send("session-end")
				}else if(!this.hadResults){
					pageEvents.send("p2-game-end")
				}
				this.hadResults = false
				this.session = false
				if(this.hashLock){
					this.hash("")
					this.hashLock = false
				}
				scoreStorage.clearP2()
				break
			case "players":
				this.onplayers(response.value)
				break
			case "gameresults":
				if(response.value && "player" in response.value){
					var resultsPeer = this.ensurePeer(response.value.player)
					resultsPeer.results = {}
					for(var i in response.value){
						if(i !== "player"){
							resultsPeer.results[i] = response.value[i] === null ? null : response.value[i].toString()
						}
					}
					this.hadResults = true
				}
				break
			case "note":
				if(response.value && "player" in response.value){
					var notePeer = this.ensurePeer(response.value.player)
					var note = {}
					for(var i in response.value){
						if(i !== "player"){
							note[i] = response.value[i]
						}
					}
					notePeer.notes.push(note)
					if(note.dai){
						notePeer.dai = note.dai
					}
				}
				break
			case "drumroll":
				if(response.value && "player" in response.value){
					var rollPeer = this.ensurePeer(response.value.player)
					rollPeer.drumrollPace = response.value.pace
					if("kaAmount" in response.value){
						rollPeer.kaAmount = response.value.kaAmount
					}
				}
				break
			case "branch":
				if(response.value && "player" in response.value){
					var branchPeer = this.ensurePeer(response.value.player)
					branchPeer.branch = "value" in response.value ? response.value.value : response.value
					branchPeer.branchSet = false
				}
				break
			case "session":
				this.clearMessage("users")
				this.session = true
				scoreStorage.clearP2()
				if(response.value && "player" in response.value){
					this.player = response.value.player
				}
				break
			case "getcrowns":
				if(response.value){
					var output = {}
					for(var i in response.value){
						if(response.value[i]){
							var score = scoreStorage.get(response.value[i], false, true)
							if(score){
								var crowns = {}
								for(var diff in score){
									if(diff !== "title"){
										crowns[diff] = {
											crown: score[diff].crown
										}
									}
								}
							}else{
								var crowns = null
							}
							output[response.value[i]] = crowns
						}
					}
					p2.send("crowns", output)
				}
				break
			case "crowns":
				if(response.value){
					var crownsSeat = response.value && "player" in response.value ? response.value.player : null
					var crownsScores = response.value && response.value.scores ? response.value.scores : response.value
					for(var i in crownsScores){
						scoreStorage.addP2(i, false, crownsScores[i], true, null, crownsSeat)
					}
				}
				break
		}
	}
	onplayers(value){
		if(!Array.isArray(value)){
			return
		}
		var beforeSeats = this.peerSeats()
		var seen = {}
		value.forEach(entry => {
			var seat = entry.player
			if(typeof seat !== "number" || seat === this.player){
				return
			}
			seen[seat] = true
			var peer = this.ensurePeer(seat)
			peer.name = entry.name ? entry.name.toString() : null
			peer.don = entry.don || null
		})
		this.peerSeats().forEach(seat => {
			if(!seen[seat]){
				delete this.peers[seat]
			}
		})
		var afterSeats = this.peerSeats()
		if(afterSeats.length > beforeSeats.length){
			scoreStorage.resetP2Requests()
		}
	}
	onhashchange(){
		if(this.hashLock){
			this.hash(this.currentHash)
		}else{
			location.reload()
		}
	}
	hash(string){
		this.currentHash = string
		history.replaceState("", "", location.pathname + (string ? "#" + string : ""))
	}
	play(circle, mekadon, seat){
		var peer = this.peers[seat]
		if(!peer){
			if(mekadon.miss(circle)){
				return
			}
			return
		}
		var type = circle.type
		var drumrollNotes = type === "balloon" || type === "drumroll" || type === "daiDrumroll"

		if(drumrollNotes && mekadon.getMS() > circle.endTime + mekadon.delay){
			circle.played(-1, false)
			mekadon.game.updateCurrentCircle()
			return
		}

		if(drumrollNotes){
			mekadon.playDrumrollAt(circle, 0, peer.drumrollPace, type === "drumroll" || type === "daiDrumroll" ? peer.kaAmount : 0)
			return
		}

		// drop notes belonging to circles this lane already passed (chart mismatch)
		while(peer.notes.length){
			var head = peer.notes[0]
			if(typeof head.at === "number" && head.at < circle.ms - 200){
				peer.notes.shift()
			}else{
				break
			}
		}
		if(peer.notes.length === 0){
			// wait for the real hit/miss message instead of showing a fake perfect hit
			return
		}
		var note = peer.notes[0]
		if(note.score >= 0){
			var dai = 1
			if(circle.type === "daiDon" || circle.type === "daiKa"){
				dai = peer.dai
			}
			if(mekadon.playAt(circle, note.ms, note.score, dai, note.reverse)){
				peer.notes.shift()
			}
		}else{
			if(mekadon.miss(circle)){
				peer.notes.shift()
			}
		}
	}
	enable(){
		this.disabled = Math.max(0, this.disabled - 1)
		setTimeout(this.open.bind(this), 100)
	}
	disable(){
		this.disabled++
		this.close()
	}
}
