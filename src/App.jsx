import React, { useState, useEffect } from 'react';
import { User, Trophy, Eye, EyeOff, RotateCcw, ShieldAlert, Crown, Smartphone, Users, Bot, Download, Clock } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';

// --- YOUR CREDENTIALS ---
const firebaseConfig = {
    apiKey: "AIzaSyArYds-rUs9lzhU_AaL7c8SCxPOYQGDU2g",
    authDomain: "royalcourt-c9e6e.firebaseapp.com",
    projectId: "royalcourt-c9e6e",
    storageBucket: "royalcourt-c9e6e.firebasestorage.app",
    messagingSenderId: "720774216418",
    appId: "1:720774216418:web:17491eeca417a1e9077cbb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GAME CONSTANTS ---
const SUITS = ['♠️', '♥️', '♣️', '♦️'];
const SUIT_ORDER = { '♠️': 0, '♥️': 1, '♣️': 2, '♦️': 3 };
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

// --- HELPERS ---
const generateRoomCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();
const getSuitStyle = (suit) => (suit === '♥️' || suit === '♦️') ? 'text-rose-500' : 'text-slate-200';

const playSound = (type) => {
  if (!window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  let text = "";
  if (type === 'cut') text = "Cut!";
  if (type === 'clear') text = "Clear.";
  if (type === 'win') text = "Round Over.";
  if (type === 'start') text = "Game Started.";
  
  if (text) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1; 
    u.volume = 0.6;
    synth.speak(u);
  }
};

const createDeck = () => {
  let deck = [];
  SUITS.forEach(suit => {
    VALUES.forEach(val => {
      deck.push({ suit, val, rank: RANK_VALUE[val], id: `${val}${suit}`, display: `${val}` });
    });
  });
  return deck;
};

const fisherYatesShuffle = (deck) => {
  let newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export default function Game() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [showBurnt, setShowBurnt] = useState(false);
  const [targetPlayers, setTargetPlayers] = useState(4); 
  const [fillWithBots, setFillWithBots] = useState(true);
  
  // Auto Restart Logic
  const [restartTimer, setRestartTimer] = useState(10);

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // 1. AUTHENTICATION
  useEffect(() => {
    signInAnonymously(auth).catch(err => {
        console.error("Auth Error:", err);
        setErrorMsg("Failed to connect. Check internet.");
    });
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
          setUser(u);
          setLoading(false);
      }
    });
    
    // PWA Install Listener
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    return () => unsubscribe();
  }, []);

  // 2. SYNC GAME DATA
  useEffect(() => {
    if (!user || !roomCode) return;
    const gameRef = doc(db, 'games', roomCode);
    
    const unsubscribe = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGameData(data);
        
        // Reset timer if game goes back to playing
        if (data.gameState === 'playing') {
            setRestartTimer(10);
        }
      } else {
        setErrorMsg("Room closed.");
        setGameData(null);
      }
    }, (err) => {
        console.error("Sync error:", err);
    });
    return () => unsubscribe();
  }, [user, roomCode]);

  // 3. AUTO RESTART TIMER
  useEffect(() => {
      if (gameData?.gameState === 'finished' && restartTimer > 0) {
          const timerId = setTimeout(() => setRestartTimer(t => t - 1), 1000);
          return () => clearTimeout(timerId);
      }
      
      // Trigger Next Round (Host Only)
      if (gameData?.gameState === 'finished' && restartTimer === 0 && gameData.hostId === user.uid) {
          handleStartGame();
      }
  }, [gameData?.gameState, restartTimer, user]);

  // 4. HOST-DRIVEN BOT LOGIC
  useEffect(() => {
    if (!gameData || !user) return;
    if (gameData.gameState !== 'playing') return;
    if (gameData.hostId !== user.uid) return; 

    const currentPlayer = gameData.players[gameData.currentTurn];
    
    const hasAlreadyPlayed = gameData.centerPile.some(p => p.playerId === gameData.currentTurn);

    if (!hasAlreadyPlayed && currentPlayer && currentPlayer.isBot && currentPlayer.status === 'playing') {
        const timer = setTimeout(() => {
            runBotMove(currentPlayer);
        }, 2500);
        return () => clearTimeout(timer);
    }
  }, [gameData, user]);


  // --- BOT BRAIN ---
  const runBotMove = (bot) => {
    if (!gameData) return;
    let cardToPlay = null;

    if (gameData.mandatoryCard) {
        cardToPlay = bot.hand.find(c => c.id === gameData.mandatoryCard.id);
        if (cardToPlay) {
            submitMove(bot.id, cardToPlay);
            return;
        }
    }

    if (gameData.centerPile.length === 0) {
      const suitsInHand = {};
      bot.hand.forEach(c => {
          if(!suitsInHand[c.suit]) suitsInHand[c.suit] = [];
          suitsInHand[c.suit].push(c);
      });
      const validSuits = Object.keys(suitsInHand);
      if (validSuits.length > 0) {
          const chosenSuit = validSuits[Math.floor(Math.random() * validSuits.length)];
          const cardsOfSuit = suitsInHand[chosenSuit];
          const playHigh = Math.random() > 0.4;
          cardToPlay = playHigh ? cardsOfSuit[0] : cardsOfSuit[cardsOfSuit.length - 1];
      } else {
          cardToPlay = bot.hand[0];
      }
    } else {
      const hasSuit = bot.hand.filter(c => c.suit === gameData.leadSuit);
      if (hasSuit.length > 0) {
        cardToPlay = hasSuit[0]; 
      } else {
        cardToPlay = bot.hand[bot.hand.length - 1]; 
      }
    }
    
    if (cardToPlay) {
        submitMove(bot.id, cardToPlay);
    }
  };


  // --- GAME ACTIONS ---

  const submitMove = async (playerId, card) => {
    const gameRef = doc(db, 'games', roomCode);
    let newPlayers = [...gameData.players];
    
    let tempPile = [...gameData.centerPile, { playerId, card }];
    
    const playerIndex = newPlayers.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    newPlayers[playerIndex].hand = newPlayers[playerIndex].hand.filter(c => c.id !== card.id);
    
    if (newPlayers[playerIndex].hand.length === 0) {
        newPlayers[playerIndex].status = 'safe';
    }

    let currentLeadSuit = gameData.leadSuit;
    let newLeadSuit = currentLeadSuit;
    if (tempPile.length === 1) {
        newLeadSuit = card.suit;
    }

    await updateDoc(gameRef, {
        players: newPlayers,
        centerPile: tempPile,
        leadSuit: newLeadSuit,
        mandatoryCard: null
    });

    const isDifferentSuit = card.suit !== newLeadSuit && newLeadSuit !== null;
    const activeCount = newPlayers.filter(p => p.status === 'playing').length;
    const isTrickComplete = tempPile.length >= activeCount + (newPlayers[playerIndex].status === 'safe' ? 1 : 0);

    if (isDifferentSuit || isTrickComplete) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        let updates = {};
        
        if (isDifferentSuit) {
            let highestRank = -1;
            let victimId = -1;
            tempPile.forEach(play => {
                if (play.card.suit === newLeadSuit && play.card.rank > highestRank) {
                    highestRank = play.card.rank;
                    victimId = play.playerId;
                }
            });

            const victimIdx = newPlayers.findIndex(p => p.id === victimId);
            if (victimIdx !== -1) {
                const pickupCards = tempPile.map(p => p.card);
                newPlayers[victimIdx].hand = [...newPlayers[victimIdx].hand, ...pickupCards].sort((a,b) => {
                    if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
                    return b.rank - a.rank;
                });
                newPlayers[victimIdx].status = 'playing'; 

                updates = {
                    players: newPlayers,
                    centerPile: [],
                    leadSuit: null,
                    currentTurn: victimId,
                    gameLog: `⚔️ ${newPlayers[playerIndex].name} CUTS! ${newPlayers[victimIdx].name} picks up.`
                };
                playSound('cut');
            }
        } 
        else if (isTrickComplete) {
            let highestRank = -1;
            let winnerId = -1;
            tempPile.forEach(play => {
                if (play.card.suit === newLeadSuit && play.card.rank > highestRank) {
                    highestRank = play.card.rank;
                    winnerId = play.playerId;
                }
            });
            
            const winnerIdx = newPlayers.findIndex(p => p.id === winnerId);
            const winnerName = newPlayers[winnerIdx].name;
            
            updates = {
                centerPile: [],
                leadSuit: null,
                gameLog: `✨ ${winnerName} cleared.`
            };
            playSound('clear');

            if (newPlayers[winnerIdx].status === 'safe') {
                updates.gameLog = `🏆 ${winnerName} IS SAFE!`;
                let nextP = (winnerIdx + 1) % newPlayers.length;
                let safetyLoop = 0;
                while (newPlayers[nextP].status === 'safe' && safetyLoop < newPlayers.length) {
                    nextP = (nextP + 1) % newPlayers.length;
                    safetyLoop++;
                }
                updates.currentTurn = nextP;
            } else {
                updates.currentTurn = winnerId;
            }
            updates.players = newPlayers;
        }

        await updateDoc(gameRef, updates);
        
        const remaining = newPlayers.filter(p => p.status === 'playing');
        if (remaining.length <= 1) {
            const loser = remaining[0];
            let finalScores = { ...gameData.scores };
            if (loser) finalScores[loser.name] = (finalScores[loser.name] || 0) + 1;
            
            await updateDoc(gameRef, {
                gameState: 'finished',
                gameLog: `GAME OVER! ${loser ? loser.name : 'Unknown'} lost.`,
                scores: finalScores
            });
            playSound('win');
        }
        
    } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        let nextIndex = (gameData.currentTurn + 1) % newPlayers.length;
        let safetyLoop = 0;
        while (newPlayers[nextIndex].status === 'safe' && safetyLoop < newPlayers.length) {
            nextIndex = (nextIndex + 1) % newPlayers.length;
            safetyLoop++;
        }
        await updateDoc(gameRef, { currentTurn: nextIndex });
    }
  };

  // --- ACTIONS ---
  const handleCreateRoom = async () => {
    if (!playerName.trim()) return setErrorMsg("Enter Name");
    const code = generateRoomCode();
    await setDoc(doc(db, 'games', code), {
      roomCode: code,
      hostId: user.uid,
      gameState: 'lobby',
      targetPlayers: 4, 
      fillWithBots: true,
      players: [{ uid: user.uid, name: playerName, hand: [], status: 'playing', id: 0, isBot: false }],
      centerPile: [],
      currentTurn: 0,
      leadSuit: null,
      burntCards: [],
      scores: { [playerName]: 0 },
      mandatoryCard: null,
      gameLog: "Waiting for players..."
    });
    setRoomCode(code);
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) return setErrorMsg("Enter Name");
    const code = joinCode.toUpperCase();
    const gameRef = doc(db, 'games', code);
    const docSnap = await getDoc(gameRef);
    if (!docSnap.exists()) return setErrorMsg("Room not found.");
    const data = docSnap.data();
    if (data.gameState !== 'lobby') return setErrorMsg("Game started.");
    if (data.players.some(p => p.uid === user.uid)) { setRoomCode(code); return; }
    if (data.players.length >= data.targetPlayers) return setErrorMsg("Room Full");

    const newPlayer = { uid: user.uid, name: playerName, hand: [], status: 'playing', id: data.players.length, isBot: false };
    await updateDoc(gameRef, { players: [...data.players, newPlayer], scores: { ...data.scores, [playerName]: 0 } });
    setRoomCode(code);
  };

  const updateLobbySettings = async (target, bots) => {
      if(gameData.hostId !== user.uid) return;
      await updateDoc(doc(db, 'games', roomCode), { targetPlayers: target, fillWithBots: bots });
  };

  const handleStartGame = async () => {
    if (!gameData) return;
    let currentPlayers = [...gameData.players];
    const needed = gameData.targetPlayers;
    
    // Remove existing bots if any (for clean restart)
    currentPlayers = currentPlayers.filter(p => !p.isBot);

    if (gameData.fillWithBots && currentPlayers.length < needed) {
        const humanCount = currentPlayers.length;
        for(let i=0; i<needed - humanCount; i++) {
            currentPlayers.push({ uid: `bot-${Date.now()}-${i}`, name: `Bot ${i+1}`, hand: [], status: 'playing', id: currentPlayers.length, isBot: true });
        }
    }

    // Fix IDs
    currentPlayers = currentPlayers.map((p, index) => ({...p, id: index}));

    let deck = fisherYatesShuffle(createDeck());
    let handSize = currentPlayers.length === 5 ? 10 : 13;
    
    currentPlayers = currentPlayers.map(p => ({
        ...p,
        hand: deck.splice(0, handSize).sort((a,b) => {
            if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
            return b.rank - a.rank;
        }),
        status: 'playing'
    }));

    const searchOrder = [...VALUES].reverse(); 
    let starterIndex = 0;
    let starterCard = null;
    for (let val of searchOrder) {
      for (let p of currentPlayers) {
        const found = p.hand.find(c => c.suit === '♠️' && c.val === val);
        if (found) { starterIndex = p.id; starterCard = found; break; }
      }
      if (starterCard) break;
    }

    let finalScores = { ...gameData.scores };
    currentPlayers.forEach(p => { if(finalScores[p.name] === undefined) finalScores[p.name] = 0; });

    await updateDoc(doc(db, 'games', roomCode), {
        gameState: 'playing',
        players: currentPlayers,
        burntCards: deck,
        currentTurn: starterIndex,
        mandatoryCard: starterCard,
        centerPile: [],
        leadSuit: null,
        scores: finalScores,
        gameLog: `${currentPlayers[starterIndex].name} starts with ${starterCard?.val}♠️`
    });
    playSound('start');
  };

  const handleInstallClick = () => {
      if(deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choice) => {
              if (choice.outcome === 'accepted') setDeferredPrompt(null);
          });
      }
  };

  const handleCardClick = (card) => {
    if (!gameData || gameData.gameState !== 'playing') return;
    const myPlayer = gameData.players.find(p => p.uid === user.uid);
    if (!myPlayer || gameData.currentTurn !== myPlayer.id) return; 
    if (gameData.mandatoryCard && card.id !== gameData.mandatoryCard.id) return alert(`Must play ${gameData.mandatoryCard.val}♠️!`);
    if (gameData.centerPile.length > 0 && gameData.leadSuit) {
        const hasSuit = myPlayer.hand.some(c => c.suit === gameData.leadSuit);
        if (hasSuit && card.suit !== gameData.leadSuit) return alert("Must follow suit!");
    }
    submitMove(myPlayer.id, card);
  };

  // --- RENDER ---
  if (loading) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;

  // VICTORY SCREEN (EARLY EXIT)
  const myPlayer = gameData?.players?.find(p => p.uid === user?.uid);
  if (gameData?.gameState === 'playing' && myPlayer?.status === 'safe') {
      return (
          <div className="h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center">
              <Trophy className="w-32 h-32 text-amber-400 mb-6 animate-bounce" />
              <h1 className="text-5xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-500 mb-2">YOU ARE SAFE!</h1>
              <p className="text-slate-400 text-lg">You have emptied your hand.</p>
              <div className="mt-8 p-4 bg-slate-800 rounded-xl border border-slate-700 animate-pulse">
                  Waiting for other players to finish...
              </div>
              
              <div className="fixed bottom-2 w-full text-center text-slate-700 text-[10px] font-sans">
                  Royal Court © Rohan Jadhav
              </div>
          </div>
      );
  }

  // GAME OVER / RESTART SCREEN
  if (gameData?.gameState === 'finished') {
      return (
          <div className="h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center">
              <ShieldAlert className="w-24 h-24 text-rose-500 mb-4" />
              <h2 className="text-3xl font-serif font-bold text-white mb-2">Round Complete</h2>
              <div className="text-slate-400 text-sm mb-8">{gameData.gameLog}</div>
              
              <div className="flex items-center gap-2 mb-8 bg-slate-800 px-6 py-3 rounded-full border border-slate-700">
                  <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
                  <span className="text-xl font-mono">Next round in <span className="text-amber-400 font-bold">{restartTimer}s</span></span>
              </div>

              {gameData.hostId === user.uid && (
                  <button onClick={handleStartGame} className="bg-emerald-500 text-slate-900 font-bold py-3 px-8 rounded-xl hover:scale-105 transition-transform">
                      Start Now
                  </button>
              )}
              
              <div className="fixed bottom-2 w-full text-center text-slate-700 text-[10px] font-sans">
                  Royal Court © Rohan Jadhav
              </div>
          </div>
      );
  }

  // LOBBY
  if (!gameData || gameData.gameState === 'lobby') {
     if (gameData && roomCode) {
         return (
             <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
                 <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-md w-full text-center">
                    <h2 className="text-3xl font-bold mb-2 text-amber-500">{roomCode}</h2>
                    <p className="text-slate-400 mb-6 text-sm">Share code with friends</p>
                    {gameData.hostId === user.uid && (
                        <div className="flex flex-col gap-3 mb-6">
                             <div className="flex justify-center gap-2">
                                 <button onClick={() => updateLobbySettings(4, gameData.fillWithBots)} className={`px-4 py-2 rounded-lg text-sm font-bold ${gameData.targetPlayers === 4 ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-400'}`}>4 Players</button>
                                 <button onClick={() => updateLobbySettings(5, gameData.fillWithBots)} className={`px-4 py-2 rounded-lg text-sm font-bold ${gameData.targetPlayers === 5 ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-400'}`}>5 Players</button>
                             </div>
                             <button onClick={() => updateLobbySettings(gameData.targetPlayers, !gameData.fillWithBots)} className={`text-xs py-1 px-3 rounded-full border ${gameData.fillWithBots ? 'border-emerald-500 text-emerald-400' : 'border-slate-600 text-slate-500'}`}>{gameData.fillWithBots ? '🤖 Bots Enabled' : '👤 Humans Only'}</button>
                        </div>
                    )}
                    <div className="space-y-2 mb-8">
                        {gameData.players.map((p, i) => <div key={i} className="flex items-center gap-3 bg-slate-900/50 p-2 rounded border border-slate-700/50"><span className="text-amber-500 font-bold">{i+1}.</span><span>{p.name} {p.uid === user.uid && "(You)"}</span></div>)}
                        {gameData.fillWithBots && Array.from({length: Math.max(0, gameData.targetPlayers - gameData.players.length)}).map((_, i) => <div key={`g${i}`} className="flex items-center gap-3 bg-slate-900/20 p-2 rounded border border-dashed border-slate-700/30 text-slate-500"><Bot size={16}/><span>Bot Slot</span></div>)}
                    </div>
                    {gameData.hostId === user.uid ? <button onClick={handleStartGame} className="w-full bg-emerald-500 text-slate-900 font-bold py-4 rounded-xl">Start Game</button> : <div className="text-xs text-slate-500 animate-pulse">Waiting for host...</div>}
                 </div>
                 <div className="fixed bottom-2 w-full text-center text-slate-700 text-[10px] font-sans">Royal Court © Rohan Jadhav</div>
             </div>
         )
     }
     return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
            <div className="max-w-md w-full space-y-6">
                <div className="text-center">
                    <Crown className="w-16 h-16 text-amber-500 mx-auto mb-2" />
                    <h1 className="text-4xl font-serif font-bold">Royal Court</h1>
                    {deferredPrompt && <button onClick={handleInstallClick} className="mt-4 flex items-center justify-center gap-2 mx-auto bg-slate-800 border border-slate-600 px-4 py-2 rounded-full text-sm hover:bg-slate-700"><Download size={16}/> Install App</button>}
                </div>
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-4 shadow-2xl">
                    {errorMsg && <div className="text-rose-400 text-xs text-center font-bold bg-rose-900/20 p-2 rounded">{errorMsg}</div>}
                    <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white text-center font-bold outline-none" placeholder="YOUR NAME" />
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={handleCreateRoom} className="bg-amber-500 text-slate-900 font-bold py-4 rounded-xl flex flex-col items-center gap-1"><Users size={20}/> Create</button>
                        <div className="space-y-2">
                             <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={4} className="w-full bg-slate-900 border border-slate-600 rounded-xl px-2 py-2 text-center text-white font-mono tracking-widest uppercase font-bold" />
                             <button onClick={handleJoinRoom} className="w-full bg-slate-700 text-white font-bold py-2 rounded-xl text-xs">Join</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="fixed bottom-2 w-full text-center text-slate-700 text-[10px] font-sans">Royal Court © Rohan Jadhav</div>
        </div>
     );
  }

  // MAIN GAME
  if (!myPlayer) return <div className="h-screen bg-slate-900 text-white flex flex-col items-center justify-center"><RotateCcw className="animate-spin mb-4 text-amber-500"/><p>Loading...</p></div>;
  const isMyTurn = gameData.currentTurn === myPlayer.id;
  const getRelativeIndex = (theirIndex) => (theirIndex - myPlayer.id + gameData.players.length) % gameData.players.length;
  const getSeatPosition = (relIdx) => {
      if (gameData.players.length === 4) {
          if (relIdx === 1) return 'left-2 top-1/2 -translate-y-1/2';
          if (relIdx === 2) return 'top-16 left-1/2 -translate-x-1/2';
          if (relIdx === 3) return 'right-2 top-1/2 -translate-y-1/2';
      } else {
          if (relIdx === 1) return 'left-2 top-1/2 -translate-y-1/2';
          if (relIdx === 2) return 'top-16 left-1/3 -translate-x-1/2';
          if (relIdx === 3) return 'top-16 right-1/3 translate-x-1/2';
          if (relIdx === 4) return 'right-2 top-1/2 -translate-y-1/2';
      }
      return 'hidden';
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex flex-col text-slate-200 font-sans overflow-hidden select-none">
       {/* HEADER */}
       <div className="h-12 bg-slate-950/80 backdrop-blur border-b border-slate-700 flex items-center justify-between px-4 z-30">
          <div className="flex items-center gap-2"><span className="font-mono bg-slate-800 px-2 py-1 rounded text-amber-400 text-xs tracking-widest border border-slate-600">{roomCode}</span></div>
          {gameData.players.length === 5 && <button onClick={() => setShowBurnt(!showBurnt)} className="flex items-center gap-1 bg-slate-800 px-3 py-1 rounded-full text-[10px] font-bold uppercase">{showBurnt ? <Eye size={12}/> : <EyeOff size={12}/>} Burnt</button>}
       </div>

       {/* LOG */}
       <div className="absolute top-14 w-full flex justify-center z-20 pointer-events-none">
           <div className="bg-slate-900/90 backdrop-blur px-4 py-1.5 rounded-b-xl border-x border-b border-slate-700 shadow-xl text-xs text-amber-100 font-bold animate-pulse text-center">{gameData.gameLog}</div>
       </div>

       {/* OPPONENTS */}
       <div className="flex-1 relative w-full h-full">
           {gameData.players.map((p) => {
               if (p.uid === user.uid) return null;
               return (
                   <div key={p.id} className={`absolute ${getSeatPosition(getRelativeIndex(p.id))} flex flex-col items-center transition-all duration-500`}>
                       <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 bg-slate-800 relative shadow-lg ${gameData.currentTurn === p.id ? 'border-amber-400 shadow-amber-500/50 scale-110' : 'border-slate-600 opacity-80'}`}>
                           {p.status === 'safe' ? <Crown className="text-emerald-400 w-4 h-4 sm:w-6 sm:h-6"/> : (p.isBot ? <Bot className="text-slate-400 w-4 h-4 sm:w-6 sm:h-6"/> : <User className="text-slate-400 w-4 h-4 sm:w-6 sm:h-6"/>)}
                           {p.status === 'playing' && <div className="absolute -bottom-1 -right-1 bg-slate-950 text-white text-[9px] w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full border border-slate-700 font-bold shadow">{p.hand?.length || 0}</div>}
                       </div>
                       <span className="text-[9px] mt-1 font-bold uppercase tracking-wider text-slate-300 bg-slate-900/80 px-2 rounded max-w-[80px] truncate">{p.name}</span>
                   </div>
               );
           })}

           {/* TABLE */}
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-32 flex items-center justify-center">
                <div className="relative w-full h-full flex items-center justify-center">
                    {gameData.centerPile.length === 0 && <div className="border-2 border-dashed border-slate-700/50 rounded-xl w-14 h-24 sm:w-20 sm:h-28 flex items-center justify-center"><span className="text-[9px] text-slate-600 font-bold uppercase">Empty</span></div>}
                    {gameData.centerPile.map((play, i) => (
                        <div key={i} className="absolute w-14 h-24 sm:w-20 sm:h-32 bg-white rounded-lg shadow-2xl border border-slate-300 flex flex-col items-center justify-center transition-all duration-300" style={{ transform: `rotate(${(i - gameData.centerPile.length/2) * 15}deg) translateY(${i * -4}px)`, zIndex: i }}>
                            <span className={`text-xl sm:text-2xl ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.suit}</span>
                            <span className={`font-bold text-base sm:text-lg ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.display}</span>
                            <div className="absolute bottom-1 text-[8px] text-slate-400 uppercase font-bold truncate max-w-[60px]">{gameData.players.find(p=>p.id===play.playerId)?.name}</div>
                        </div>
                    ))}
                </div>
           </div>
       </div>

       {/* PLAYER HAND */}
       <div className="h-40 w-full flex flex-col items-center justify-end pb-2 relative z-20">
           <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 px-4 py-1 rounded-full ${isMyTurn ? 'bg-amber-500/20 text-amber-400 animate-pulse border border-amber-500/50' : 'bg-slate-800/50 text-slate-500'}`}>{isMyTurn ? "Your Turn" : "Wait..."}</div>
           <div className="w-full flex justify-center overflow-visible px-4">
               <div className="flex items-end justify-center w-full max-w-lg relative" style={{ height: '140px' }}>
                   {myPlayer.hand.map((card, idx) => {
                       const totalCards = myPlayer.hand.length;
                       // Dynamic Squeezing for Mobile - Tighter values
                       const overlap = totalCards > 10 ? -25 : (totalCards > 7 ? -20 : -10); // Mobile default
                       
                       // Responsive Styles
                       const style = { marginLeft: idx === 0 ? 0 : `${overlap}px`, zIndex: idx };
                       
                       const isMandatory = gameData.mandatoryCard && card.id === gameData.mandatoryCard.id;
                       const canPlay = isMyTurn && (!gameData.mandatoryCard || isMandatory) && (gameData.centerPile.length === 0 || card.suit === gameData.leadSuit || !myPlayer.hand.some(c => c.suit === gameData.leadSuit));

                       return (
                           <button key={card.id} onClick={() => handleCardClick(card)} disabled={!isMyTurn} style={style} className={`w-14 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 bg-white rounded-xl shadow-2xl border relative flex flex-col items-center justify-between p-1 sm:p-2 flex-shrink-0 transition-all duration-200 origin-bottom ${canPlay ? 'hover:-translate-y-6 hover:scale-110 cursor-pointer border-slate-300 z-50' : 'border-slate-300 opacity-100'} ${isMandatory ? 'ring-4 ring-amber-500 animate-bounce' : ''}`}>
                                <div className="w-full flex justify-between pointer-events-none"><span className={`font-bold text-sm sm:text-lg ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.display}</span></div>
                                <div className={`text-2xl sm:text-4xl ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.suit}</div>
                                <div className="w-full flex justify-between rotate-180 pointer-events-none"><span className={`font-bold text-sm sm:text-lg ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.display}</span></div>
                           </button>
                       )
                   })}
               </div>
           </div>
       </div>

       {/* BURNT CARDS OVERLAY */}
       {showBurnt && (
           <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900/95 p-4 rounded-xl border border-amber-500 z-50 shadow-2xl">
               <div className="text-xs text-amber-500 font-bold mb-2 uppercase text-center">Burnt Cards</div>
               <div className="flex gap-2">{gameData.burntCards.map(c => <div key={c.id} className="w-8 h-12 bg-slate-200 rounded flex items-center justify-center text-slate-900 font-bold text-xs">{c.suit}</div>)}</div>
               <button onClick={()=>setShowBurnt(false)} className="w-full mt-2 text-[10px] text-slate-400 uppercase font-bold tracking-wider">Close</button>
           </div>
       )}
       
       <div className="fixed bottom-2 w-full text-center text-slate-700 text-[10px] font-sans pointer-events-none">Royal Court © Rohan Jadhav</div>
    </div>
  );
}