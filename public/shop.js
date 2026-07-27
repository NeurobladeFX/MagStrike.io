const SHOP_DATA = {
  outfits: [
    { id: 'none', name: 'NONE', price: 0, img: null },
    { id: 'outfit_mage', name: 'Mage Hat', price: 200, img: 'assets/mage_hat.png' },
    { id: 'outfit_samurai', name: 'Samurai Hat', price: 500, img: 'assets/samurai_hat.png' },
    { id: 'outfit_pirate', name: 'Pirate Hat', price: 600, img: 'assets/pirate_hat.png' },
    { id: 'outfit_headband', name: 'Ninja Headband', price: 300, img: 'assets/headband.PNG' }
  ],
  armbands: [
    { id: 'none', name: 'NONE', price: 0, img: null },
    { id: 'outfit_handband_shadow', name: 'Shadow Band', price: 1000, img: 'assets/handband_shadow.png' },
    { id: 'outfit_handband_ninja', name: 'Ninja Band', price: 500, img: 'assets/ninja_armband.png' }
  ],
  effects: [
    { id: 'none', name: 'NONE', price: 0, img: null },
    { id: 'effect_shadow', name: 'Shadow Fog', price: 1000, img: 'assets/ninja_eye1.png' },
    { id: 'effect_dragon', name: 'Dragon Aura', price: 2000, img: 'assets/dragon_aura.png' },
    { id: 'effect_watcher_eye', name: 'Watcher Eye', price: 2000, img: 'assets/watcher_eye.png' }
  ]
};

const shop = {
  currentTab: 'outfits',
  ownedOutfits: ['outfit_mage', 'none'],
  ownedEffects: ['none'],
  ownedArmbands: ['none'],
  
  init() {
    this.loadShopSave();
  },
  
  loadShopSave() {
    const data = localStorage.getItem('typing_battle_shop');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.ownedOutfits = parsed.ownedOutfits || ['outfit_mage', 'none'];
        this.ownedEffects = parsed.ownedEffects || ['none'];
        this.ownedArmbands = parsed.ownedArmbands || ['none'];
      } catch (e) { console.error('Shop save corrupt'); }
    }
  },
  
  saveShop() {
    localStorage.setItem('typing_battle_shop', JSON.stringify({
      ownedOutfits: this.ownedOutfits,
      ownedEffects: this.ownedEffects,
      ownedArmbands: this.ownedArmbands
    }));
  },
  
  switchTab(tab) {
    this.currentTab = tab;
    // Update active tab button visually
    document.querySelectorAll('.shop-tabs .tab').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    this.render();
  },
  
  render() {
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';
    
    const items = SHOP_DATA[this.currentTab];
    
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'shop-item';
      
      let isOwned = false;
      let isEquipped = false;
      let action = '';
      
      if (this.currentTab === 'outfits') {
        isOwned = this.ownedOutfits.includes(item.id);
        isEquipped = (appState.outfit === item.id) || (item.id === 'none' && !appState.outfit);
        action = `shop.equipOutfit('${item.id}')`;
      } else if (this.currentTab === 'armbands') {
        isOwned = this.ownedArmbands.includes(item.id);
        isEquipped = (appState.armband === item.id) || (item.id === 'none' && !appState.armband);
        action = `shop.equipArmband('${item.id}')`;
      } else {
        isOwned = this.ownedEffects.includes(item.id);
        isEquipped = (appState.effect === item.id) || (item.id === 'none' && !appState.effect);
        action = `shop.equipEffect('${item.id}')`;
      }
      
      let btnHtml = '';
      if (isEquipped) {
        btnHtml = `<button class="cancel-btn" disabled>EQUIPPED</button>`;
      } else if (isOwned) {
        btnHtml = `<button class="cancel-btn" style="color: #fff; border-color: #fff;" onclick="${action}">EQUIP</button>`;
      } else {
        let buyAction = this.currentTab === 'outfits' ? `shop.buyOutfit('${item.id}', ${item.price})` :
                        this.currentTab === 'armbands' ? `shop.buyArmband('${item.id}', ${item.price})` :
                        `shop.buyEffect('${item.id}', ${item.price})`;
        btnHtml = `<button class="cancel-btn" style="color: #ffd700; border-color: #ffd700;" onclick="${buyAction}">BUY <img src="assets/coin.png" style="width:16px; height:16px; vertical-align:middle; margin-left:4px;"> ${app.formatGold(item.price)}</button>`;
      }
      
      let visualHtml = '';
      if (item.img) {
        visualHtml = `<img src="${item.img}" style="width: 80px; height: 80px; object-fit: contain; margin: 0 auto 15px auto; display: block; border-radius: 10px;">`;
      } else {
        visualHtml = `<div style="width: 80px; height: 80px; background: ${item.color || '#fff'}; border-radius: 50%; margin: 0 auto 15px auto; display: flex; align-items:center; justify-content:center; color: #000; font-weight: bold;">${item.name.charAt(0)}</div>`;
      }

      div.innerHTML = `
        ${visualHtml}
        <h3>${item.name}</h3>
        <p style="margin: 10px 0; color: var(--text-muted);">${isOwned ? 'OWNED' : app.formatGold(item.price) + ' GOLD'}</p>
        ${btnHtml}
      `;
      
      grid.appendChild(div);
    });
  },
  
  buyOutfit(id, price) {
    if (appState.credits >= price) {
      appState.credits -= price;
      this.ownedOutfits.push(id);
      app.saveGame();
      this.saveShop();
      this.render();
    } else {
      alert("NOT ENOUGH GOLD!");
    }
  },
  
  buyEffect(id, price) {
    if (appState.credits >= price) {
      appState.credits -= price;
      this.ownedEffects.push(id);
      app.saveGame();
      this.saveShop();
      this.render();
    } else {
      alert("NOT ENOUGH GOLD!");
    }
  },
  
  equipOutfit(id) {
    appState.outfit = id === 'none' ? null : id;
    app.saveGame();
    this.render();
    this.syncToBackend();
  },

  equipArmband(id) {
    appState.armband = id === 'none' ? null : id;
    app.saveGame();
    this.render();
    this.syncToBackend();
  },

  equipEffect(id) {
    appState.effect = id === 'none' ? null : id;
    app.saveGame();
    this.render();
    this.syncToBackend();
  },
  
  buyArmband(id, price) {
    if (appState.credits >= price) {
      appState.credits -= price;
      this.ownedArmbands.push(id);
      app.saveGame();
      this.saveShop();
      this.render();
    } else {
      alert("NOT ENOUGH GOLD!");
    }
  },
  
  syncToBackend() {
    // Stub for HTTP API call to Render backend
    console.log("PATCH /api/player - Syncing stats to backend...");
    /*
    fetch(RENDER_SERVER_URL + '/api/player', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avatar: appState.avatar,
        stats: '...'
      })
    });
    */
  }
};

window.addEventListener('load', () => {
  shop.init();
});
