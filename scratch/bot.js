const { io } = require("socket.io-client");

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Bot connected with ID:", socket.id);
  
  // Join matchmaking
  socket.emit("joinRandom", {
    name: "SHADOWMAGE",
    avatar: "avatar_stickman_assassin",
    outfit: "shadow_cloak",
    effect: "sharingan",
    armband: "handband_shadow",
    level: 50,
    wpm: 9999,
    gold: 999999,
    wins: 9999,
    losses: 0,
    trophy: 7
  });
});

let attackInterval = null;

socket.on("matchStarted", (data) => {
  console.log("Match started! Room:", data.roomId);
  
  // Simulate fast typing
  // Send 8 attacks per second (~ 480 WPM, or extremely fast)
  attackInterval = setInterval(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const letter = chars.charAt(Math.floor(Math.random() * chars.length));
    const spellId = Math.random().toString();
    
    socket.emit('attack', { 
      damage: 1, 
      wpm: 500, 
      letter: letter, 
      move: 'Spell_' + letter, 
      spellId 
    });
  }, 125);
});

socket.on("gameOver", () => {
  console.log("Game over, stopping bot attacks.");
  if (attackInterval) clearInterval(attackInterval);
  socket.disconnect();
  process.exit(0);
});
