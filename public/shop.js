const SHOP_DATA = {
  outfits: [
    { id: 'outfit_mage', name: 'Mage Hat', price: 200, img: 'assets/mage_hat.png' },
    { id: 'outfit_samurai', name: 'Samurai Hat', price: 500, img: 'assets/samurai_hat.png' }
  ],
  effects: [
    { id: 'effect_shadow', name: 'Shadow Fog', price: 1000, img: 'assets/ninja_eye1.png' },
    { id: 'effect_dragon', name: 'Dragon Aura', price: 2000, img: 'assets/dragon_aura.png' }
  ]
};

const shop = {
  currentTab: 'outfits',
  ownedOutfits: ['outfit_mage'],
  ownedEffects: [],
  
  init() {
    this.loadShopSave();
  },
  
  loadShopSave() {
    const data = localStorage.getItem('typing_battle_shop');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.ownedOutfits = parsed.ownedOutfits || ['outfit_mage'];
        this.ownedEffects = parsed.ownedEffects || [];
      } catch (e) { console.error('Shop save corrupt'); }
    }
  },
  
  saveShop() {
    localStorage.setItem('typing_battle_shop', JSON.stringify({
      ownedOutfits: this.ownedOutfits,
      ownedEffects: this.ownedEffects
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
      
      let isOwned = this.currentTab === 'outfits' ? this.ownedOutfits.includes(item.id) : this.ownedEffects.includes(item.id);
      let isEquipped = (appState.outfit === item.id) || (appState.effect === item.id);
      
      let btnHtml = '';
      if (isEquipped) {
        btnHtml = `<button class="cancel-btn" disabled>EQUIPPED</button>`;
      } else if (isOwned) {
        let action = this.currentTab === 'outfits' ? `shop.equipOutfit('${item.id}')` : `shop.equipEffect('${item.id}')`;
        btnHtml = `<button class="cancel-btn" style="color: #fff; border-color: #fff;" onclick="${action}">EQUIP</button>`;
      } else {
        let action = this.currentTab === 'outfits' ? `shop.buyOutfit('${item.id}', ${item.price})` : `shop.buyEffect('${item.id}', ${item.price})`;
        btnHtml = `<button class="cancel-btn" style="color: #ffd700; border-color: #ffd700;" onclick="${action}">BUY <img src="assets/coin.png" style="width:16px; height:16px; vertical-align:middle; margin-left:4px;"> ${item.price}</button>`;
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
        <p style="margin: 10px 0; color: var(--text-muted);">${isOwned ? 'OWNED' : item.price + ' GOLD'}</p>
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
    appState.outfit = id;
    app.saveGame();
    this.render();
    this.syncToBackend();
  },

  equipEffect(id) {
    appState.effect = id;
    app.saveGame();
    this.render();
    this.syncToBackend();
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
