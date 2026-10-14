class LoadSong{
	constructor(...args){
		this.init(...args)
	}
	init(selectedSong, autoPlayEnabled, multiplayer, touchEnabled, baisoku = 1){
		this.selectedSong = selectedSong
		this.autoPlayEnabled = autoPlayEnabled
		this.multiplayer = multiplayer
		this.touchEnabled = touchEnabled
		this.baisoku = baisoku
		var resolution = settings.getItem("resolution")
		this.imgScale = 1
		if(resolution === "medium"){
			this.imgScale = 0.75
		}else if(resolution === "low"){
			this.imgScale = 0.5
		}else if(resolution === "lowest"){
			this.imgScale = 0.25
		}
		
		loader.changePage("loadsong", true)
		var loadingText = document.getElementById("loading-text")
		loadingText.appendChild(document.createTextNode(strings.loading))
		loadingText.setAttribute("alt", strings.loading)
		if(multiplayer){
			var cancel = document.getElementById("p2-cancel-button")
			cancel.appendChild(document.createTextNode(strings.cancel))
			cancel.setAttribute("alt", strings.cancel)
		}
		this.run()
		pageEvents.send("load-song", {
			selectedSong: selectedSong,
			autoPlayEnabled: autoPlayEnabled,
			multiplayer: multiplayer,
			touchEnabled: touchEnabled
		})
	}
	run(){
		var song = this.selectedSong
		var id = song.folder
		var songObj
		this.promises = []
		if(id !== "calibration"){
			assets.sounds["v_start"].play()
			assets.songs.forEach(song => {
				if(song.id === id){
					songObj = song
				}else{
					if(song.sound){
						song.sound.clean()
						delete song.sound
					}
					delete song.lyricsData
				}
			})
		}else{
			songObj = {
				music: "muted",
				custom: true
			}
		}
		this.songObj = songObj
		
		song.songBg = this.randInt(1, 5)
		song.songStage = this.randInt(1, 3)
		song.donBg = this.randInt(1, 6)
		
		if(song.songSkin && song.songSkin.name){
			var imgLoad = []
			for(var type in song.songSkin){
				var value = song.songSkin[type]
				if(["song", "stage", "don"].indexOf(type) !== -1 && value && value !== "none"){
					var filename = "bg_" + type + "_" + song.songSkin.name
					if(value === "static"){
						imgLoad.push({
							filename: filename,
							type: type
						})
					}else{
						imgLoad.push({
							filename: filename + "_a",
							type: type
						})
						imgLoad.push({
							filename: filename + "_b",
							type: type
						})
					}
					if(type === "don"){
						song.donBg = null
					}else if(type === "song"){
						song.songBg = null
					}else if(type === "stage"){
						song.songStage = null
					}
				}
			}
			var skinBase = gameConfig.assets_baseurl + "song_skins/"
			for(var i = 0; i < imgLoad.length; i++){
				let filename = imgLoad[i].filename
				let prefix = song.songSkin.prefix || ""
				if((prefix + filename) in assets.image){
					continue
				}
				let img = document.createElement("img")
				let force = imgLoad[i].type === "song" && this.touchEnabled
				if(!songObj.custom){
					img.crossOrigin = "anonymous"
				}
				let promise = pageEvents.load(img)
				this.addPromise(promise.then(() => {
					return this.scaleImg(img, filename, prefix, force)
				}), songObj.custom ? filename + ".png" : skinBase + filename + ".png")
				if(songObj.custom){
					this.addPromise(song.songSkin[filename + ".png"].blob().then(blob => {
						img.src = URL.createObjectURL(blob)
					}), song.songSkin[filename + ".png"].url)
				}else{
					img.src = skinBase + filename + ".png"
				}
			}
		}
		this.loadSongBg(id)
		
		if(songObj.sound && songObj.sound.buffer){
			songObj.sound.gain = snd.musicGain
		}else if(songObj.music !== "muted"){
			this.addPromise(snd.musicGain.load(songObj.music).then(sound => {
				songObj.sound = sound
			}), songObj.music.url)
		}
		var chart = songObj.chart
		if(chart && chart.separateDiff){
			var chartDiff = this.selectedSong.difficulty
			chart = chart[chartDiff]
		}
		if(chart){
			this.addPromise(chart.read(song.type === "tja" ? "utf-8" : "").then(data => {
				this.songData = data.replace(/\0/g, "").split("\n")
			}), chart.url)
		}else{
			this.songData = ""
		}
		if(songObj.lyricsFile && !songObj.lyricsData && !this.multiplayer && (!this.touchEnabled || this.autoPlayEnabled) && settings.getItem("showLyrics")){
			this.addPromise(songObj.lyricsFile.read().then(data => {
				songObj.lyricsData = data
			}, () => {}), songObj.lyricsFile.url)
		}
		if(this.touchEnabled && !assets.image["touch_drum"]){
			let img = document.createElement("img")
			img.crossOrigin = "anonymous"
			var url = gameConfig.assets_baseurl + "img/touch_drum.png"
			this.addPromise(pageEvents.load(img).then(() => {
				return this.scaleImg(img, "touch_drum", "")
			}), url)
			img.src = url
		}
		var resultsImg = [
			"results_flowers",
			"results_mikoshi",
			"results_tetsuohana",
			"results_tetsuohana2"
		]
		resultsImg.forEach(id => {
			if(!assets.image[id]){
				var img = document.createElement("img")
				img.crossOrigin = "anonymous"
				var url = gameConfig.assets_baseurl + "img/" + id + ".png"
				this.addPromise(pageEvents.load(img).then(() => {
					return this.scaleImg(img, id, "")
				}), url)
				img.src = url
			}
		})
		if(songObj.volume && songObj.volume !== 1){
			this.promises.push(new Promise(resolve => setTimeout(resolve, 500)))
		}
		Promise.all(this.promises).then(() => {
			if(!this.error){
				this.setupMultiplayer()
			}
		})
	}
	addPromise(promise, url){
		this.promises.push(promise.catch(response => {
			this.errorMsg(response, url)
			return Promise.resolve()
		}))
	}
	errorMsg(error, url){
		if(!this.error){
			if(url){
				error = (Array.isArray(error) ? error[0] + ": " : (error ? error + ": " : "")) + url
			}
			pageEvents.send("load-song-error", error)
			errorMessage(new Error(error).stack)
			var title = this.selectedSong.title
			if(title !== this.selectedSong.originalTitle){
				title += " (" + this.selectedSong.originalTitle + ")"
			}
			assets.sounds["v_start"].stop()
			setTimeout(() => {
				this.clean()
				new SongSelect(false, false, this.touchEnabled, null, {
					name: "loadSongError",
					title: title,
					id: this.selectedSong.folder,
					error: error
				})
			}, 500)
		}
		this.error = true
	}
	loadSongBg(){
		var filenames = []
		if(this.selectedSong.songBg !== null){
			filenames.push("bg_song_" + this.selectedSong.songBg)
		}
		if(this.selectedSong.donBg !== null){
			filenames.push("bg_don_" + this.selectedSong.donBg)
			if(this.multiplayer){
				filenames.push("bg_don2_" + this.selectedSong.donBg)
			}
		}
		if(this.selectedSong.songStage !== null){
			filenames.push("bg_stage_" + this.selectedSong.songStage)
		}
		for(var i = 0; i < filenames.length; i++){
			var filename = filenames[i]
			var stage = filename.startsWith("bg_stage_")
			for(var letter = 0; letter < (stage ? 1 : 2); letter++){
				let filenameAb = filenames[i] + (stage ? "" : (letter === 0 ? "a" : "b"))
				if(!(filenameAb in assets.image)){
					let img = document.createElement("img")
					let force = filenameAb.startsWith("bg_song_") && this.touchEnabled
					img.crossOrigin = "anonymous"
					var url = gameConfig.assets_baseurl + "img/" + filenameAb + ".png"
					this.addPromise(pageEvents.load(img).then(() => {
						return this.scaleImg(img, filenameAb, "", force)
					}), url)
					img.src = url
				}
			}
		}
	}
	scaleImg(img, filename, prefix, force){
		return new Promise((resolve, reject) => {
			var scale = this.imgScale
			if(force && scale > 0.5){
				scale = 0.5
			}
			var canvas = document.createElement("canvas")
			var w = Math.floor(img.width * scale)
			var h = Math.floor(img.height * scale)
			canvas.width = Math.max(1, w)
			canvas.height = Math.max(1, h)
			var ctx = canvas.getContext("2d")
			ctx.drawImage(img, 0, 0, w, h)
			var saveScaled = url => {
				let img2 = document.createElement("img")
				pageEvents.load(img2).then(() => {
					assets.image[prefix + filename] = img2
					loader.assetsDiv.appendChild(img2)
					resolve()
				}, reject)
				img2.id = prefix + filename
				img2.src = url
			}
			if("toBlob" in canvas){
				canvas.toBlob(blob => {
					saveScaled(URL.createObjectURL(blob))
				})
			}else{
				saveScaled(canvas.toDataURL())
			}
		})
	}
	randInt(min, max){
		return Math.floor(Math.random() * (max - min + 1)) + min
	}
	setupMultiplayer(){
		var song = this.selectedSong
		
		if(this.multiplayer){
			var loadingText = document.getElementsByClassName("loading-text")[0]
			loadingText.firstChild.data = strings.waitingForP2
			loadingText.setAttribute("alt", strings.waitingForP2)
			
			this.cancelButton = document.getElementById("p2-cancel-button")
			this.cancelButton.style.display = "inline-block"
			pageEvents.add(this.cancelButton, ["mousedown", "touchstart"], this.cancelLoad.bind(this))
			
			this.peerData = {}
			pageEvents.add(p2, "message", event => {
				if(event.type === "gameload"){
					this.cancelButton.style.display = ""
					
					var peers = event.value && Array.isArray(event.value.players) ? event.value.players : []
					var diffCache = {}
					var loadPromises = []
					peers.forEach(entry => {
						if(!diffCache.hasOwnProperty(entry.diff)){
							diffCache[entry.diff] = this.loadDiffData(entry.diff)
						}
						loadPromises.push(diffCache[entry.diff].then(data => {
							var selectedSong2 = {}
							for(var i in song){
								selectedSong2[i] = song[i]
							}
							if(entry.diff !== song.difficulty){
								selectedSong2.difficulty = entry.diff
							}
							this.peerData[entry.player] = {
								selectedSong: selectedSong2,
								songData: data
							}
						}))
					})
					Promise.all(loadPromises).then(() => {
						if(!this.error){
							this.startMultiplayer()
						}
					})
				}else if(event.type === "gamestart"){
					var peerData = this.peerData
					this.clean()
					p2.clearMessage("songsel")
					// local controller first: it injects the game page (canvas) the mirrors draw on
					var taikoGame1 = new Controller(song, this.songData, false, 1, this.touchEnabled, this.baisoku, p2.player)
					var mirrors = p2.peerSeats().map(seat => {
						var data = peerData[seat] || {selectedSong: song, songData: this.songData}
						return new Controller(data.selectedSong, data.songData, true, 2, this.touchEnabled, this.baisoku, seat)
					})
					taikoGame1.run(mirrors)
					pageEvents.send("load-song-player2", mirrors.length ? mirrors[0].selectedSong : song)
				}else if(event.type === "left" || event.type === "gameend" || event.type === "loadcancel"){
					this.clean()
					new SongSelect(false, false, this.touchEnabled)
				}
			})
			p2.send("join", {
				id: song.folder,
				diff: song.difficulty,
				name: account.loggedIn ? account.displayName : null,
				don: account.loggedIn ? account.don : null
			})
		}else{
			this.clean()
			var taikoGame = new Controller(song, this.songData, this.autoPlayEnabled, false, this.touchEnabled, this.baisoku)
			taikoGame.run()
		}
	}
	loadDiffData(diff){
		var song = this.selectedSong
		if(diff === song.difficulty){
			return Promise.resolve(this.songData)
		}
		var chart = this.songObj.chart
		if(song.type === "tja" || !chart || !chart.separateDiff || !chart[diff]){
			return Promise.resolve(this.songData)
		}
		return chart[diff].read(song.type === "tja" ? "utf-8" : "").then(data => {
			return data.replace(/\0/g, "").split("\n")
		}, () => {
			return this.songData
		})
	}
	startMultiplayer(repeat){
		if(document.hasFocus()){
			p2.send("gamestart")
		}else{
			if(!repeat){
				assets.sounds["v_sanka"].play()
				pageEvents.send("load-song-unfocused")
			}
			setTimeout(() => {
				this.startMultiplayer(true)
			}, 100)
		}
	}
	cancelLoad(event){
		if(event.type === "mousedown"){
			if(event.which !== 1){
				return
			}
		}else{
			event.preventDefault()
		}
		p2.send("leave")
		assets.sounds["se_don"].play()
		this.cancelButton.style.pointerEvents = "none"
		pageEvents.send("load-song-cancel")
	}
	clean(){
		delete this.promises
		delete this.songObj
		pageEvents.remove(p2, "message")
		if(this.cancelButton){
			pageEvents.remove(this.cancelButton, ["mousedown", "touchstart"])
			delete this.cancelButton
		}
	}
}
