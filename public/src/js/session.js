class Session{
	constructor(...args){
		this.init(...args)
	}
	init(touchEnabled){
		this.touchEnabled = touchEnabled
		loader.changePage("session", true)
		this.endButton = this.getElement("view-end-button")
		if(touchEnabled){
			this.getElement("view-outer").classList.add("touch-enabled")
		}
		this.sessionInvite = document.getElementById("session-invite")
		this.sessionPlayers = document.getElementById("session-players")
		
		var tutorialTitle = this.getElement("view-title")
		tutorialTitle.innerText = strings.session.multiplayerSession
		tutorialTitle.setAttribute("alt", strings.session.multiplayerSession)
		this.sessionInvite.parentNode.insertBefore(document.createTextNode(strings.session.linkTutorial), this.sessionInvite)
		this.updateButton()
		
		pageEvents.add(window, ["mousedown", "touchstart"], this.mouseDown.bind(this))
		this.keyboard = new Keyboard({
			confirm: ["enter", "space", "don_l", "don_r"],
			back: ["escape"]
		}, this.keyPress.bind(this))
		this.gamepad = new Gamepad({
			confirm: ["start", "ls", "rs"],
			back: ["a", "b"]
		}, this.keyPress.bind(this))
		
		p2.hashLock = true
		pageEvents.add(p2, "message", response => {
			if(response.type === "invite"){
				this.sessionInvite.innerText = location.origin + location.pathname + "#" + response.value
				p2.hash(response.value)
			}else if(response.type === "session"){
				this.updatePlayers()
			}else if(response.type === "players"){
				this.updatePlayers()
			}else if(response.type === "songsel"){
				p2.clearMessage("users")
				this.clean()
				assets.sounds["se_don"].play()
				setTimeout(() => {
					new SongSelect(false, false, this.touchEnabled)
				}, 500)
				pageEvents.send("session-start", "host")
			}
		})
		this.updatePlayers()
		p2.send("invite", {
			id: null,
			name: account.loggedIn ? account.displayName : null,
			don: account.loggedIn ? account.don : null
		})
		pageEvents.send("session")
	}
	getElement(name){
		return loader.screen.getElementsByClassName(name)[0]
	}
	getSeatName(seat){
		var fallback = seat % 2 === 0 ? strings.default2PName : strings.defaultName
		if(seat === p2.player){
			return account.loggedIn ? account.displayName : fallback
		}
		var peer = p2.getPeer(seat)
		return (peer && peer.name) || fallback
	}
	playerCount(){
		var occupied = {}
		p2.peerSeats().forEach(seat => {
			occupied[seat] = true
		})
		occupied[p2.player] = true
		var count = 0
		for(var seat = 1; seat <= 4; seat++){
			if(occupied[seat]){
				count++
			}
		}
		return count
	}
	canStart(){
		return !!p2.session && this.playerCount() > 1
	}
	updateButton(){
		var label = this.canStart() ? strings.session.startGame : strings.session.cancel
		this.endButton.innerText = label
		this.endButton.setAttribute("alt", label)
	}
	updatePlayers(){
		if(!this.sessionPlayers){
			return
		}
		var occupied = {}
		p2.peerSeats().forEach(seat => {
			occupied[seat] = true
		})
		occupied[p2.player] = true
		while(this.sessionPlayers.firstChild){
			this.sessionPlayers.removeChild(this.sessionPlayers.firstChild)
		}
		var countEl = document.createElement("div")
		countEl.className = "session-player-count"
		countEl.innerText = this.playerCount() + " / 4"
		this.sessionPlayers.appendChild(countEl)
		for(var seat = 1; seat <= 4; seat++){
			var joined = !!occupied[seat]
			var row = document.createElement("div")
			row.className = "session-player-row"
			if(seat === p2.player){
				row.className += " session-player-you"
			}
			if(!joined){
				row.className += " session-player-waiting"
			}
			var seatEl = document.createElement("span")
			seatEl.className = "session-player-seat"
			seatEl.innerText = seat + "P"
			var nameEl = document.createElement("span")
			nameEl.className = "session-player-name"
			nameEl.innerText = joined ? this.getSeatName(seat) : "…"
			row.appendChild(seatEl)
			row.appendChild(nameEl)
			this.sessionPlayers.appendChild(row)
		}
		this.updateButton()
	}
	mouseDown(event){
		if(event.type === "mousedown" && event.which !== 1){
			return
		}
		if(event.target === this.sessionInvite){
			this.sessionInvite.focus()
		}else{
			getSelection().removeAllRanges()
			this.sessionInvite.blur()
		}
		if(event.target === this.endButton){
			if(this.canStart()){
				this.start()
			}else{
				this.cancel()
			}
		}
	}
	keyPress(pressed, name){
		if(!pressed){
			return
		}
		if(name === "back"){
			this.cancel()
		}else{
			if(this.canStart()){
				this.start()
			}
		}
	}
	start(){
		if(!this.canStart()){
			return
		}
		p2.send("songsel")
	}
	cancel(){
		if(!p2.session){
			p2.send("leave")
			p2.hash("")
			p2.hashLock = false
			pageEvents.send("session-cancel")
		}
		this.clean()
		assets.sounds["se_don"].play()
		setTimeout(() => {
			new SongSelect(false, false, this.touchEnabled)
		}, 500)
	}
	clean(){
		this.keyboard.clean()
		this.gamepad.clean()
		pageEvents.remove(window, ["mousedown", "touchstart"])
		pageEvents.remove(p2, "message")
		delete this.endButton
		delete this.sessionInvite
		delete this.sessionPlayers
	}
}
