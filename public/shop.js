const SHOP_DATA = {
  cosmetics: [
    { id: 'hero_pig', name: 'Pink Pig', price: 0, color: '#ffb8b8' },
    { id: 'hero_shadow', name: 'Shadow Ninja', price: 100, color: '#333333' },
    { id: 'hero_gold', name: 'Golden Champion', price: 500, color: '#ffd700' },
    { id: 'hero_blood', name: 'Blood Warrior', price: 1000, color: '#ff0000' }
  ],
  upgrades: [
    { id: 'upg_damage', name: 'Damage +1', price: 200, effect: 'dmg' },
    { id: 'upg_health', name: 'Health +10', price: 200, effect: 'hp' }
  ]
};

const shop = {
  currentTab: 'cosmetics',
  ownedCosmetics: ['hero_pig'],
  
  init() {
    this.loadShopSave();
  },
  
  loadShopSave() {
    const data = localStorage.getItem('typing_battle_shop');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.ownedCosmetics = parsed.ownedCosmetics || ['hero_pig'];
      } catch (e) { console.error('Shop save corrupt'); }
    }
  },
  
  saveShop() {
    localStorage.setItem('typing_battle_shop', JSON.stringify({
      ownedCosmetics: this.ownedCosmetics
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
      
      let isOwned = this.ownedCosmetics.includes(item.id);
      let isEquipped = (appState.avatar === item.id);
      
      let btnHtml = '';
      if (this.currentTab === 'cosmetics') {
        if (isEquipped) {
          btnHtml = `<button class="cancel-btn" disabled>EQUIPPED</button>`;
        } else if (isOwned) {
          btnHtml = `<button class="cancel-btn" style="color: #fff; border-color: #fff;" onclick="shop.equip('${item.id}')">EQUIP</button>`;
        } else {
          btnHtml = `<button class="cancel-btn" style="color: #ffd700; border-color: #ffd700;" onclick="shop.buyCosmetic('${item.id}', ${item.price})">BUY ${item.price}</button>`;
        }
      } else {
        btnHtml = `<button class="cancel-btn" style="color: #ffd700; border-color: #ffd700;" onclick="shop.buyUpgrade('${item.id}', ${item.price})">UPGRADE ${item.price}</button>`;
      }
      
      div.innerHTML = `
        <div style="width: 80px; height: 80px; background: ${item.color || '#fff'}; border-radius: 50%; margin: 0 auto 15px auto; display: flex; align-items:center; justify-content:center; color: #000; font-weight: bold;">
          ${item.name.charAt(0)}
        </div>
        <h3>${item.name}</h3>
        <p style="margin: 10px 0; color: var(--text-muted);">${isOwned && this.currentTab === 'cosmetics' ? 'OWNED' : item.price + ' CREDITS'}</p>
        ${btnHtml}
      `;
      
      grid.appendChild(div);
    });
  },
  
  buyCosmetic(id, price) {
    if (appState.credits >= price) {
      appState.credits -= price;
      this.ownedCosmetics.push(id);
      app.saveGame();
      this.saveShop();
      this.render();
    } else {
      alert("NOT ENOUGH CREDITS");
    }
  },
  
  equip(id) {
    appState.avatar = id;
    app.saveGame();
    this.render();
    // Stub HTTP API call to sync to Render backend
    this.syncToBackend();
  },
  
  buyUpgrade(id, price) {
    if (appState.credits >= price) {
      appState.credits -= price;
      app.saveGame();
      alert('Upgrade Purchased! (Stub)');
      this.render();
      this.syncToBackend();
    } else {
      alert("NOT ENOUGH CREDITS");
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
