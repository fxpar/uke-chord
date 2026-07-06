(function () {
  const svg = `
<svg id="ukeChordSvg" width="90" height="112" viewBox="0 0 90 112" style="font-family: sans-serif; font-size: 11px;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <title id="title">uke-chord</title>
  <style id="style"></style>
  <text id="chordName" x="50%" y="16"  text-anchor="middle" style="font-size: 16px;"></text>
  <defs>
    <circle id="bubble" r="6" transform="translate(1,11)"/>
    <path id="ex" d="M0,0L8,8m0,-8L0,8" stroke-width="1.1" transform="translate(-3,-11)"/>
    <circle id="openString" r="4" fill="none" stroke-width="1" transform="translate(1,-7)"/>
    <rect id="diamond" width="14" height="14" transform="translate(1,2),rotate(45)"></rect>
  </defs>
  <g id="tab">
    <text id="position" x="-6" y="15" text-anchor="end"></text>
    <g id="frets"></g>
    <g id="strings"></g>
  </g>
</svg>`;
  const defaultFretCount = 4;
  const maxFretCount = 20;
  const maxStringCount = 10;

  function _translate(x, y, el) {
    el.setAttribute("transform", "translate(" + x + "," + y + ")");
  }

  function _node(name, attributes){
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    attributes && Object.keys(attributes).forEach(key => {
      node.setAttribute(key, attributes[key] + '' );
    });
    return node;
  }

  function _use(refName, attributes) {
    const node = _node("use", attributes);
    node.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + refName);
    return node;
  }

  function resolveCssVariable(styles, name, fallback) {
    if (!styles || typeof styles.getPropertyValue !== 'function') return fallback;
    const value = styles.getPropertyValue(name);
    if (!value) return fallback;
    return value.trim() || fallback;
  }

  class UkeChord extends HTMLElement {
    connectedCallback() {
      // attach the named attributes to 'this'
      for (let i = 0; i < this.attributes.length; i++) {
        this[this.attributes[i].name] = this.attributes[i].value;
      }

      this.attachShadow({ mode: 'open' });
      const template = document.createElement("template");
      template.innerHTML = svg;

      // add all svg elements with an id to this.$
      const elementsWithId = template.content.querySelectorAll('*[id]');
      this.$ = {};
      elementsWithId.forEach(el => { this.$[el.id] = el; })
      
      // parameter parsing
      if(this.frets){
        // Modif Fxp split fingers with commas to 
		// have fingers on multiple fingers on one string
		//this.frets = this.frets.split("").slice(0, maxStringCount);
		this.frets = this.parseFrets(this.frets);
      }else{
        throw Error('frets attribute is required')
      }
      
      // Modif Fxp split fingers
	  //this.fingers = this.fingers ? this.fingers.split("") : [];
	  this.fingers = this.parseFingers(this.fingers);
      this.sub = this.parseSub(this.sub)
	  this.sub2 = this.parseSub(this.sub2)
      this.size = this.parseSize(this.size)
      this.r = this.r ? this.r.split("") : [];
      const barre = this.barre ? this.barre.split("").slice(0, this.frets.length) : [];
      this.barreSegments = this.parseBarre(barre);
      const parsedPosition = parseInt(this.position, 10);
      this.position = Number.isNaN(parsedPosition) ? null : parsedPosition;
      this.name = (this.name && this.name.length > 0) ? this.name : null
      this.fretCount = this.parseLength(this.length)

      // colors - resolve user defined CSS variables, with fallback to default values. Can't just use CSS directly bc `img` attribute won't work
      const styles = getComputedStyle(this);
      this.fillColor = resolveCssVariable(styles, '--uke-fill', 'black');
      this.fingerTextColor = resolveCssVariable(styles, '--uke-fingertext', 'white');
      this.textColor = resolveCssVariable(styles, '--uke-text', 'black');

      this.$.style.textContent = `
      rect { fill: ${this.fillColor}; }
      #openString { stroke: ${this.fillColor}; }
      #ex { stroke: ${this.fillColor}; }
      #bubble { fill: ${this.fillColor}; }
      text { fill: ${this.textColor}; }
      #strings text { fill: ${this.fingerTextColor}; }
      `;

      // computed properties
      this.tabWidth = (this.frets.length - 1) * 20 + 2;
      this.viewBoxWidth = this.tabWidth + 30 + (this.position ? 6 : 0);
      this.tabHeight = this.fretCount * 20;
	  // Modif FXP: resize to allow a second level of sub information
      //this.viewBoxHeight = this.tabHeight + 25 + (this.name ? 25 : 0);
      this.viewBoxHeight = this.tabHeight + 25 + (this.name ? 25 : 0)+ (this.sub2 ? 25 : 0);
	  this.tabX = (this.viewBoxWidth - this.tabWidth)/2;
      this.tabY = 12 + (this.name ? 20 : 0);
      
      this.reset();
      this.render();

      if(this.hasAttribute('img')){
        // create an image that can be saved by the user and possibly indexed by search engines
        const img= document.createElement("img");
        img.alt = (this.name ? `${this.name} ` : '' ) + 'chord'
        img.title = img.alt
        img.src = `data:image/svg+xml;utf8,${encodeURIComponent(template.innerHTML.replace(/\s*(\r\n|\n|\r)\s*/gm,""))}`
        this.shadowRoot.appendChild(img)
      }else{
        // append the SVG inline by appending the template content
        this.shadowRoot.appendChild(template.content);
      }
    }

    reset(){
     // reset containers before drawing so repeated renders don't duplicate elements
      this.$.frets.replaceChildren();
      this.$.strings.replaceChildren();

      let sibling = this.$.strings.nextSibling;
      while (sibling) {
        const next = sibling.nextSibling;
        sibling.remove();
        sibling = next;
      }

      this.$.position.textContent = '';
      this.$.chordName.textContent = '';
    }

    render() {
      this.showPosition();
      this.showName();

      const barreSegments = this.barreSegments || [];

      // add horizontal fret lines
      for(let i=0; i< this.fretCount + 1; i++){
        const fret = _node("rect", {x: 0,  y: i * 20, width: this.tabWidth, height: 2 })
        this.$["frets"].appendChild(fret)
      }

      // add vertical strings, and for each string a bubble, an open circle marker, an x marker, and a fingering
      this.frets.forEach((fret, idx) => {
        const x = idx * 20;
        const string = _node("rect", {x,  y: 0, width: 2, height: this.tabHeight })
        this.$["strings"].appendChild(string)

        // add diamond heads, strings on ukulele are counted from the right to the left, so 1 equals idx 3, 2=2, 3=1, 4=0
        if(this.r.includes(this.frets.length - idx + '')){
          const y = (parseInt(fret) - 1) * 20;
          const diamond = _use('diamond', { x, y })
          this.$["strings"].appendChild(diamond)
        }
        
        if (fret === "0") {
          const circle = _use('openString', {x})
          this.$["strings"].appendChild(circle)
        } else if(fret === "x" || fret === 'X'){
          const ex = _use('ex', { x })
          this.$["strings"].appendChild(ex)
        } else {
          const fretNumber = parseInt(fret, 10);
          if(!(fretNumber > 0)) return;
          const y = (fretNumber - 1) * 20;
          // const bubble = _use('bubble', { x, y })
          // this.$["strings"].appendChild(bubble)
		  //FXP: trying adding multiple bubble per fret
		  if(fret.split("").length >1){
			  for(let i=0; i< fret.split("").length; i++){
				  const y = (parseInt(fret.split("")[i]) - 1) * 20;
				  // try to add Diamond for last of multiple fingers
				 if (i === fret.split("").length -1){
					 if(this.r.includes(this.frets.length - idx + '')){
					 // const y = (parseInt(fret) - 1) * 20;
					  const diamond = _use('diamond', { x, y })
					  this.$["strings"].appendChild(diamond)
					 }
				 }
				 
				  const bubble = _use('bubble', { x, y })
				  this.$["strings"].appendChild(bubble);
				  const text = _node("text", { x: x + 1, y: y + 15, fill: 'white', stroke:"#FFFFFF",'text-anchor': 'middle' })
					text.innerHTML = this.fingers[idx][i] !== "0" ? this.fingers[idx][i] : '';
					this.$["strings"].appendChild(text)
				 
				
				
			  }
		  }else{
			  const bubble = _use('bubble', { x, y })
				  this.$["strings"].appendChild(bubble)
		  }

          // add finger numbers on top of the bubbles
          if(this.fingers[idx]){
			  
			if(this.fingers[idx].length >1){
				  /*
					Nothing
				  */
				  
				  // const text = _node("text", { x: x + 1, y: y + 15 - 1, fill: 'white', stroke:"#FFFFFF", 'text-anchor': 'middle', style:'font-size: 0.8em;' })
				const text = _node("text", { x: x + 1, y: y + 15, 'text-anchor': 'middle', style:'font-size: 0.8em;' })
				text.innerHTML = this.fingers[idx] !== "0" ? this.fingers[idx] : '';
				this.$["strings"].appendChild(text)
				  
				  
			  }else{
				const text = _node("text", { x: x + 1, y: y + 15, 'text-anchor': 'middle' })
				text.innerHTML = this.fingers[idx] !== "0" ? this.fingers[idx] : '';
				this.$["strings"].appendChild(text)
			  }
			  
          }
        }

        // add the text under each string
        if(this.sub[idx]){
          const y = this.tabHeight + 13;
          const text = _node("text", { x, y, 'text-anchor': 'middle' })
          text.innerHTML = this.sub[idx] !== "_" ? this.sub[idx] : '';
          this.$["tab"].appendChild(text)
        }
		
		// Modif FXP add sub2 text
        if(this.sub2[idx]){
			//console.log("FX sub2");
          const y = this.tabHeight + 13 +13 ;
          const text = _node("text", { x, y, 'text-anchor': 'middle' })
          text.innerHTML = this.sub2[idx] !== "_" ? this.sub2[idx] : '';
          this.$["tab"].appendChild(text)
        }		
		
      });

      barreSegments.forEach(segment => {
        const x = segment.start * 20 - 5;
        const width = (segment.end - segment.start) * 20 + 12;
        const y = (segment.fret - 1) * 20 + 5;
        const barre = _node("rect", { x, y, width, height: 12, rx: 6, ry: 6 });
        
        // --- STYLE SPÉCIFIQUE POUR LA FRETTE 0 ---
        if (segment.fret === 0) {
          // Rendre le barré semi-transparent (0.4 = 40% d'opacité) pour la frette 0
          barre.setAttribute("style", "opacity: 0.4;");
        }
        // -----------------------------------------

        this.$["strings"].appendChild(barre);

        // --- RAJOUT : DESSINER LES BULLES EN BORDURE INVERSÉE ---
        for (let idx = segment.start; idx <= segment.end; idx++) {
          const stringFret = parseInt(this.frets[idx], 10);
          
          // On ne dessine la bulle que si la corde fait bien partie du barré à cette frette
          if (stringFret === segment.fret) {
            const stringX = idx * 20;
            // On calcule le y de la bulle (le script d'origine fait : (fret - 1) * 20 )
            const bubbleY = (stringFret - 1) * 20;
            
            // On réutilise la forme de bulle d'origine ('bubble')
            const invertedBubble = _use('bubble', { x: stringX, y: bubbleY });
            
            // On applique le style inversé : pas de fond (transparent) et bordure de la couleur du texte/composant
            // Si frette 0 (barré transparent), on utilise l'opacité ou une bordure fine pour correspondre.
            const strokeColor = this.fillColor; 
            invertedBubble.setAttribute("style", `fill: none; stroke: ${this.fingerTextColor}; stroke-width: 1.5;`);
            
            this.$["strings"].appendChild(invertedBubble);
          }
        }
        // --------------------------------------------------------
      });

      _translate(this.tabX, this.tabY, this.$.tab);
      this.$.ukeChordSvg.setAttribute("width", this.viewBoxWidth * this.size);
      this.$.ukeChordSvg.setAttribute("height", this.viewBoxHeight * this.size);
      this.$.ukeChordSvg.setAttribute("viewBox", `0 0 ${this.viewBoxWidth} ${this.viewBoxHeight}`);
    }

    // show start position on the left side of the tab
    showPosition() {
      const p = this.position;
      if (p === 0) {
        // draw a thick bar at the top representing the nut
        const nut = _node("rect", {x: 0,  y: -1, width: this.tabWidth, height: 4 })
        this.$["frets"].appendChild(nut)
      } else if (p > 0 && p < 100) {
        this.$.position.innerHTML = p;
      }
    }

    // show chord name above the tab
    showName() {
      if(this.name) this.$.chordName.innerHTML = this.name;
      this.$.title.innerHTML = this.name || 'Tab';
    }

parseFrets(frets) {
      let subText;
      if (!frets) return [];
      //if using commas in the sub text as separators
      if (frets.indexOf(",") > 0) {
        subText = this.frets.split(",");
      } else {
        subText = this.frets.split("");
      }
      return subText || [];
    }

    parseFingers(fingers) {
      let subText;
      if (!fingers) return [];
      //if using commas in the sub text as separators
      if (fingers.indexOf(",") > 0) {
        subText = this.fingers.split(",");
      } else {
        subText = this.fingers.split("");
      }
      return subText || [];
    }
	  
    parseSub(sub) {
      let subText;
      if (!sub) return [];
      //if using commas in the sub text as separators
      if (sub.indexOf(",") > 0) {
        subText = sub.split(",");
      } else {
        subText = sub.split("");
      }
      return subText || [];
    }
	
	parseSub2(sub) {
      let subText;
      if (!sub) return [];
      //if using commas in the sub text as separators
      if (sub.indexOf(",") > 0) {
        subText = this.sub2.split(",");
      } else {
        subText = this.sub2.split("");
      }
      return subText || [];
    }

    parseSize(size) {
      let ratio = 1
      if (size === "L" || size === "l") {
        ratio = 1.8
      } else if(parseFloat(size) > 0){
        ratio = parseFloat(size);
      }
      return ratio
    }

    parseLength(length){
      let len = parseInt(length, 10);
      if(!len || len > maxFretCount) len = defaultFretCount;
      return len;
    }

    parseBarre(barre){
      if(!barre || !barre.length) return [];

      const segments = [];
      let start = null;
      let currentFret = null;

      const flush = (endIndex) => {
        if(start !== null){
          const length = endIndex - start;
		  // Modif FXP pour barré sur 0
          // MODIFICATION : On vérifie explicitement que currentFret n'est pas null ou undefined,
          // pour accepter la valeur 0.
          if(length >= 2 && currentFret !== null && currentFret !== undefined){
            segments.push({ start, end: endIndex - 1, fret: currentFret });
          }
        }
        start = null;
        currentFret = null;
      };

      barre.forEach((value, idx) => {
        const barreFret = parseInt(value, 10);
		// modif FXP pour barré sur 0
        // MODIFICATION : On accepte 0 (on rejette seulement NaN et les nombres négatifs)
        if(Number.isNaN(barreFret) || barreFret < 0){
          flush(idx);
          return;
        }

        if(start === null){
          start = idx;
          currentFret = barreFret;
          return;
        }

        if(barreFret !== currentFret){
          flush(idx);
          start = idx;
          currentFret = barreFret;
        }
      });

      flush(barre.length);
      return segments;
    }
  }

  customElements.define('uke-chord', UkeChord);
})();
