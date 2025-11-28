import React, { useState, useEffect } from 'react';
import { User, Trophy, Eye, EyeOff, RotateCcw, ShieldAlert, Crown, Smartphone, Users, Bot } from 'lucide-react';
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
    u.rate = 1.2;
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
  
  // Lobby Options
  const [targetPlayers, setTargetPlayers] = useState(4); 
  const [fillWithBots, setFillWithBots] = useState(true);

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
    return () => unsubscribe();
  }, []);

  // 2. SYNC GAME DATA
  useEffect(() => {
    if (!user || !roomCode) return;
    const gameRef = doc(db, 'games', roomCode);
    
    const unsubscribe = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameData(docSnap.data());
      } else {
        setErrorMsg("Room closed.");
        setGameData(null);
      }
    }, (err) => {
        console.error("Sync error:", err);
    });
    return () => unsubscribe();
  }, [user, roomCode]);

  // 3. HOST-DRIVEN BOT LOGIC
  useEffect(() => {
    if (!gameData || !user) return;
    if (gameData.gameState !== 'playing') return;
    if (gameData.hostId !== user.uid) return; // Only host runs bots

    const currentPlayer = gameData.players[gameData.currentTurn];
    if (currentPlayer && currentPlayer.isBot && currentPlayer.status === 'playing') {
        const timer = setTimeout(() => {
            runBotMove(currentPlayer);
        }, 1500);
        return () => clearTimeout(timer);
    }
  }, [gameData, user]);


  // --- BOT BRAIN ---
  const runBotMove = (bot) => {
    if (!gameData) return;
    let cardToPlay = null;

    // Mandatory Check
    if (gameData.mandatoryCard) {
        cardToPlay = bot.hand.find(c => c.id === gameData.mandatoryCard.id);
        if (cardToPlay) {
            submitMove(bot.id, cardToPlay);
            return;
        }
    }

    if (gameData.centerPile.length === 0) {
      // LEADING
      const suitsInHand = {};
      bot.hand.forEach(c => {
          if(!suitsInHand[c.suit]) suitsInHand[c.suit] = [];
          suitsInHand[c.suit].push(c);
      });
      const validSuits = Object.keys(suitsInHand);
      if (validSuits.length > 0) {
          const chosenSuit = validSuits[Math.floor(Math.random() * validSuits.length)];
          const cardsOfSuit = suitsInHand[chosenSuit];
          // Mix of aggressive and safe play
          const playHigh = Math.random() > 0.4;
          cardToPlay = playHigh ? cardsOfSuit[0] : cardsOfSuit[cardsOfSuit.length - 1];
      } else {
          // Should not happen if hand not empty
          cardToPlay = bot.hand[0];
      }

    } else {
      // FOLLOWING
      const hasSuit = bot.hand.filter(c => c.suit === gameData.leadSuit);
      if (hasSuit.length > 0) {
        cardToPlay = hasSuit[0]; // Play highest to clear
      } else {
        // CUTTING: Throw lowest junk
        cardToPlay = bot.hand[bot.hand.length - 1]; 
      }
    }
    
    if (cardToPlay) {
        submitMove(bot.id, cardToPlay);
    } else {
        console.error("Bot could not find a card to play!");
    }
  };


  // --- ACTIONS ---

  const handleCreateRoom = async () => {
    if (!playerName.trim()) return setErrorMsg("Enter Name");
    const code = generateRoomCode();
    const gameRef = doc(db, 'games', code);
    
    const initialData = {
      roomCode: code,
      hostId: user.uid,
      gameState: 'lobby',
      targetPlayers: 4, 
      fillWithBots: true,
      players: [{
        uid: user.uid,
        name: playerName,
        hand: [],
        status: 'playing',
        id: 0,
        isBot: false
      }],
      centerPile: [],
      currentTurn: 0,
      leadSuit: null,
      burntCards: [],
      scores: { [playerName]: 0 },
      mandatoryCard: null,
      gameLog: "Waiting for players..."
    };

    await setDoc(gameRef, initialData);
    setRoomCode(code);
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) return setErrorMsg("Enter Name");
    if (!joinCode.trim()) return setErrorMsg("Enter Code");
    
    const code = joinCode.toUpperCase();
    const gameRef = doc(db, 'games', code);
    
    try {
        const docSnap = await getDoc(gameRef);
        if (!docSnap.exists()) return setErrorMsg("Room not found.");
        const data = docSnap.data();
        
        if (data.gameState !== 'lobby') return setErrorMsg("Game started already");
        if (data.players.some(p => p.uid === user.uid)) {
            setRoomCode(code);
            return;
        }
        if (data.players.length >= data.targetPlayers) return setErrorMsg("Room Full");

        const newPlayer = {
            uid: user.uid,
            name: playerName,
            hand: [],
            status: 'playing',
            id: data.players.length,
            isBot: false
        };
        const newScores = { ...data.scores, [playerName]: 0 };

        await updateDoc(gameRef, {
            players: [...data.players, newPlayer],
            scores: newScores
        });
        setRoomCode(code);
    } catch (e) {
        setErrorMsg("Error joining.");
    }
  };

  const updateLobbySettings = async (target, bots) => {
      if(gameData.hostId !== user.uid) return;
      const gameRef = doc(db, 'games', roomCode);
      await updateDoc(gameRef, { targetPlayers: target, fillWithBots: bots });
  };

  const handleStartGame = async () => {
    if (!gameData) return;
    
    let currentPlayers = [...gameData.players];
    const needed = gameData.targetPlayers;
    
    // FILL WITH BOTS IF ENABLED
    if (gameData.fillWithBots && currentPlayers.length < needed) {
        const botsNeeded = needed - currentPlayers.length;
        for(let i=0; i<botsNeeded; i++) {
            currentPlayers.push({
                uid: `bot-${Date.now()}-${i}`,
                name: `Bot ${i+1}`,
                hand: [],
                status: 'playing',
                id: currentPlayers.length,
                isBot: true
            });
        }
    }

    let deck = fisherYatesShuffle(createDeck());
    
    // Cards Per Player Logic
    const playerCount = currentPlayers.length;
    // Standard rules: 4 players = 13 cards. 5 players = 10 cards.
    // If we have weird numbers (like 2 or 3 humans, no bots), assume 13 cards max or until deck exhaustion.
    let handSize = 13;
    if (playerCount === 5) handSize = 10;
    
    // Deal Cards
    currentPlayers = currentPlayers.map(p => {
        const hand = deck.splice(0, handSize).sort((a,b) => {
            if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
            return b.rank - a.rank;
        });
        return { ...p, hand, status: 'playing' };
    });

    const burnt = deck; // Remainder (usually 2 cards for 5 players)

    // First Player (Highest Spade)
    const searchOrder = [...VALUES].reverse(); 
    let starterIndex = 0;
    let starterCard = null;

    for (let val of searchOrder) {
      for (let p of currentPlayers) {
        const found = p.hand.find(c => c.suit === '♠️' && c.val === val);
        if (found) {
          starterIndex = p.id;
          starterCard = found;
          break;
        }
      }
      if (starterCard) break;
    }

    // Init Scores
    let finalScores = { ...gameData.scores };
    currentPlayers.forEach(p => {
        if(finalScores[p.name] === undefined) finalScores[p.name] = 0;
    });

    const gameRef = doc(db, 'games', roomCode);
    await updateDoc(gameRef, {
        gameState: 'playing',
        players: currentPlayers,
        burntCards: burnt,
        currentTurn: starterIndex,
        mandatoryCard: starterCard,
        centerPile: [],
        leadSuit: null,
        scores: finalScores,
        gameLog: `${currentPlayers[starterIndex].name} starts with ${starterCard?.val}♠️`
    });
    playSound('start');
  };

  const submitMove = async (playerId, card) => {
    const gameRef = doc(db, 'games', roomCode);
    
    // Clone Data
    let newPlayers = [...gameData.players];
    let newPile = [...gameData.centerPile, { playerId, card }];
    
    const playerIndex = newPlayers.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return; // Safety check

    // Remove card
    newPlayers[playerIndex].hand = newPlayers[playerIndex].hand.filter(c => c.id !== card.id);
    
    let updates = {
        players: newPlayers,
        centerPile: newPile,
        mandatoryCard: null 
    };

    let currentLeadSuit = gameData.leadSuit;
    if (newPile.length === 1) {
        currentLeadSuit = card.suit;
        updates.leadSuit = card.suit;
    }

    const isDifferentSuit = card.suit !== currentLeadSuit && currentLeadSuit !== null;
    const activeCount = newPlayers.filter(p => p.status === 'playing').length;
    const isTrickComplete = newPile.length === activeCount;

    // --- LOGIC: CUT ---
    if (isDifferentSuit) {
        let highestRank = -1;
        let victimId = -1;
        newPile.forEach(play => {
            if (play.card.suit === currentLeadSuit && play.card.rank > highestRank) {
                highestRank = play.card.rank;
                victimId = play.playerId;
            }
        });

        const victimIdx = newPlayers.findIndex(p => p.id === victimId);
        if (victimIdx !== -1) {
            const pickupCards = newPile.map(p => p.card);
            newPlayers[victimIdx].hand = [...newPlayers[victimIdx].hand, ...pickupCards].sort((a,b) => {
                if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
                return b.rank - a.rank;
            });

            updates.players = newPlayers;
            updates.centerPile = [];
            updates.leadSuit = null;
            updates.currentTurn = victimId;
            updates.gameLog = `⚔️ ${newPlayers[playerIndex].name} CUTS! ${newPlayers[victimIdx].name} picks up.`;
            playSound('cut');
            await updateDoc(gameRef, updates);
            return;
        }
    }

    // --- LOGIC: CLEAR ---
    if (isTrickComplete) {
        let highestRank = -1;
        let winnerId = -1;
        newPile.forEach(play => {
            if (play.card.suit === currentLeadSuit && play.card.rank > highestRank) {
                highestRank = play.card.rank;
                winnerId = play.playerId;
            }
        });
        
        const winnerName = newPlayers.find(p=>p.id===winnerId)?.name || 'Unknown';
        updates.centerPile = [];
        updates.leadSuit = null;
        updates.gameLog = `✨ ${winnerName} cleared.`;
        playSound('clear');

        const winnerIdx = newPlayers.findIndex(p => p.id === winnerId);
        
        // Check Safe
        if (winnerIdx !== -1 && newPlayers[winnerIdx].hand.length === 0) {
            newPlayers[winnerIdx].status = 'safe';
            updates.gameLog += ` ${newPlayers[winnerIdx].name} is SAFE!`;
            
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
        
        // Check Game Over
        const remaining = newPlayers.filter(p => p.status === 'playing');
        if (remaining.length <= 1) {
            updates.gameState = 'finished';
            const loser = remaining[0];
            updates.gameLog = `ROUND OVER! ${loser ? loser.name : 'Unknown'} lost.`;
            
            let finalScores = { ...gameData.scores };
            if (loser) finalScores[loser.name] = (finalScores[loser.name] || 0) + 1;
            updates.scores = finalScores;
            playSound('win');
        }

        await updateDoc(gameRef, updates);
        return;
    }

    // --- LOGIC: NEXT TURN ---
    let nextIndex = (gameData.currentTurn + 1) % newPlayers.length;
    let safetyLoop = 0;
    while (newPlayers[nextIndex].status === 'safe' && safetyLoop < newPlayers.length) {
        nextIndex = (nextIndex + 1) % newPlayers.length;
        safetyLoop++;
    }
    updates.currentTurn = nextIndex;
    
    await updateDoc(gameRef, updates);
  };

  const handleCardClick = (card) => {
    if (!gameData || gameData.gameState !== 'playing') return;
    const myPlayer = gameData.players.find(p => p.uid === user.uid);
    if (!myPlayer) return;
    if (gameData.currentTurn !== myPlayer.id) return; 

    // Validation
    if (gameData.mandatoryCard && card.id !== gameData.mandatoryCard.id) return alert(`Must play ${gameData.mandatoryCard.val}♠️!`);
    if (gameData.centerPile.length > 0 && gameData.leadSuit) {
        const hasSuit = myPlayer.hand.some(c => c.suit === gameData.leadSuit);
        if (hasSuit && card.suit !== gameData.leadSuit) return alert("Must follow suit!");
    }
    submitMove(myPlayer.id, card);
  };


  // --- RENDER ---

  if (loading) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;

  // LOBBY
  if (!gameData || gameData.gameState === 'lobby') {
     if (gameData && roomCode) {
         return (
             <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
                 <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-md w-full text-center">
                    <h2 className="text-3xl font-bold mb-2 text-amber-500">{roomCode}</h2>
                    <p className="text-slate-400 mb-6 text-sm">Share code with friends</p>
                    
                    {/* HOST CONTROLS */}
                    {gameData.hostId === user.uid && (
                        <div className="flex flex-col gap-3 mb-6">
                             <div className="flex justify-center gap-2">
                                 <button 
                                    onClick={() => updateLobbySettings(4, gameData.fillWithBots)} 
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${gameData.targetPlayers === 4 ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-400'}`}
                                 >
                                    4 Players
                                 </button>
                                 <button 
                                    onClick={() => updateLobbySettings(5, gameData.fillWithBots)} 
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${gameData.targetPlayers === 5 ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-400'}`}
                                 >
                                    5 Players
                                 </button>
                             </div>
                             <button 
                                onClick={() => updateLobbySettings(gameData.targetPlayers, !gameData.fillWithBots)}
                                className={`text-xs py-1 px-3 rounded-full border ${gameData.fillWithBots ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-slate-600 text-slate-500'}`}
                             >
                                {gameData.fillWithBots ? '🤖 Filling empty seats with Bots' : '👤 Humans Only (No Bots)'}
                             </button>
                        </div>
                    )}
                    
                    <div className="space-y-2 mb-8">
                        {gameData.players.map((p, i) => (
                            <div key={i} className="flex items-center gap-3 bg-slate-900/50 p-2 rounded border border-slate-700/50">
                                <span className="text-amber-500 font-bold">{i+1}.</span>
                                <span>{p.name} {p.uid === user.uid && "(You)"}</span>
                            </div>
                        ))}
                        {/* Ghost Players for Bots */}
                        {gameData.fillWithBots && Array.from({length: Math.max(0, gameData.targetPlayers - gameData.players.length)}).map((_, i) => (
                             <div key={`ghost-${i}`} className="flex items-center gap-3 bg-slate-900/20 p-2 rounded border border-dashed border-slate-700/30 text-slate-500">
                                <Bot size={16} />
                                <span>Bot will fill this spot</span>
                             </div>
                        ))}
                        {!gameData.fillWithBots && gameData.players.length < 2 && (
                            <div className="text-rose-400 text-xs mt-2">Need at least 2 players to start!</div>
                        )}
                    </div>

                    {gameData.hostId === user.uid ? (
                        <button onClick={handleStartGame} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20">
                            Start Game
                        </button>
                    ) : (
                        <div className="text-xs text-slate-500 animate-pulse">Waiting for host...</div>
                    )}
                 </div>
             </div>
         )
     }

     return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
            <div className="max-w-md w-full space-y-6">
                <div className="text-center">
                    <Crown className="w-16 h-16 text-amber-500 mx-auto mb-2" />
                    <h1 className="text-4xl font-serif font-bold">Royal Court</h1>
                </div>

                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-4 shadow-2xl">
                    {errorMsg && <div className="text-rose-400 text-xs text-center font-bold bg-rose-900/20 p-2 rounded">{errorMsg}</div>}
                    
                    <input 
                        value={playerName}
                        onChange={e => setPlayerName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white text-center font-bold focus:border-amber-500 outline-none"
                        placeholder="ENTER YOUR NAME"
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={handleCreateRoom} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-4 rounded-xl flex flex-col items-center gap-1">
                            <Users size={20} />
                            Create Room
                        </button>
                        <div className="space-y-2">
                             <input 
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="CODE"
                                maxLength={4}
                                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-2 py-2 text-center text-white font-mono tracking-widest uppercase font-bold"
                             />
                             <button onClick={handleJoinRoom} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-xl text-xs">
                                Join
                             </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
     );
  }

  // GAME VIEW
  const myPlayer = gameData.players.find(p => p.uid === user.uid);
  
  // --- BLANK SCREEN FIX ---
  // If myPlayer is not found yet (sync delay), show loading instead of crashing
  if (!myPlayer) {
      return (
          <div className="h-screen bg-slate-900 text-white flex flex-col items-center justify-center">
              <RotateCcw className="animate-spin mb-4 text-amber-500" />
              <p>Entering the Court...</p>
          </div>
      );
  }
  
  const isMyTurn = gameData.currentTurn === myPlayer.id;

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex flex-col text-slate-200 font-sans overflow-hidden select-none">
       {/* HEADER */}
       <div className="h-12 bg-slate-950/80 backdrop-blur border-b border-slate-700 flex items-center justify-between px-4 z-30">
          <div className="flex items-center gap-2">
              <span className="font-mono bg-slate-800 px-2 py-1 rounded text-amber-400 text-xs tracking-widest border border-slate-600">{roomCode}</span>
          </div>
          {gameData.players.length === 5 && (
            <button onClick={() => setShowBurnt(!showBurnt)} className="flex items-center gap-1 bg-slate-800 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                {showBurnt ? <Eye size={12}/> : <EyeOff size={12}/>} Burnt
            </button>
          )}
       </div>

       {/* LOG */}
       <div className="absolute top-14 w-full flex justify-center z-20 pointer-events-none">
           <div className="bg-slate-900/90 backdrop-blur px-4 py-1.5 rounded-b-xl border-x border-b border-slate-700 shadow-xl text-xs text-amber-100 font-bold animate-pulse">
               {gameData.gameLog}
           </div>
       </div>

       {/* OPPONENTS */}
       <div className="mt-12 flex justify-center gap-3 px-2">
           {gameData.players.filter(p => p.uid !== user.uid).map(p => (
               <div key={p.id} className={`flex flex-col items-center transition-all duration-500 ${gameData.currentTurn === p.id ? 'opacity-100 scale-110' : 'opacity-50 scale-90'}`}>
                   <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 bg-slate-800 relative
                       ${gameData.currentTurn === p.id ? 'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'border-slate-600'}
                   `}>
                       {p.status === 'safe' ? <Crown className="text-emerald-400 w-4 h-4" /> : (p.isBot ? <Bot className="text-slate-400 w-4 h-4" /> : <User className="text-slate-400 w-4 h-4" />)}
                       {p.status === 'playing' && (
                           <div className="absolute -bottom-1 -right-1 bg-slate-950 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full border border-slate-700 font-bold">
                               {p.hand?.length || 0}
                           </div>
                       )}
                   </div>
                   <span className="text-[8px] mt-1 font-bold uppercase tracking-wider text-slate-400 max-w-[50px] truncate">{p.name}</span>
               </div>
           ))}
       </div>

       {/* TABLE */}
       <div className="flex-1 flex items-center justify-center relative perspective-[1000px]">
            <div className="relative w-24 h-32 flex items-center justify-center">
                {gameData.centerPile.length === 0 && (
                     <div className="w-full h-full border-2 border-dashed border-slate-700/50 rounded-xl flex items-center justify-center">
                         <div className="text-[9px] uppercase font-bold text-slate-600">Table Empty</div>
                     </div>
                )}
                {gameData.centerPile.map((play, i) => (
                    <div 
                        key={i}
                        className="absolute w-20 h-32 bg-white rounded-lg shadow-xl border border-slate-200 flex flex-col items-center justify-center transition-all"
                        style={{
                            transform: `rotate(${(i - gameData.centerPile.length/2) * 12}deg) translateY(${i * -3}px)`,
                            zIndex: i
                        }}
                    >
                        <span className={`text-2xl ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.suit}</span>
                        <span className={`font-bold text-lg ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.display}</span>
                        <div className="absolute bottom-1 text-[8px] text-slate-400 uppercase font-bold truncate max-w-[60px]">
                            {gameData.players.find(p=>p.id===play.playerId)?.name || 'Unknown'}
                        </div>
                    </div>
                ))}
            </div>
       </div>

       {/* MY HAND - RESPONSIVE CONTAINER */}
       <div className="mb-2 flex flex-col items-center w-full">
           <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isMyTurn ? 'text-amber-400 animate-pulse' : 'text-slate-600'}`}>
               {isMyTurn ? "Your Turn" : "Opponent's Turn"}
           </div>
           
           {/* Smart Responsive Card Container */}
           <div className="h-36 w-full flex justify-center overflow-visible px-4">
               <div className="flex items-end justify-center h-full w-full max-w-2xl relative">
                   {myPlayer.hand.map((card, idx) => {
                       // Dynamic Squeeze: The more cards you have, the more they overlap
                       const totalCards = myPlayer.hand.length;
                       // Tighten spacing significantly if hand is large to keep it on screen
                       const overlap = totalCards > 10 ? -45 : (totalCards > 7 ? -35 : -20);
                       
                       const style = { marginLeft: idx === 0 ? 0 : `${overlap}px`, zIndex: idx };
                       
                       const isMandatory = gameData.mandatoryCard && card.id === gameData.mandatoryCard.id;
                       const canPlay = isMyTurn && 
                                       (!gameData.mandatoryCard || isMandatory) && 
                                       (gameData.centerPile.length === 0 || card.suit === gameData.leadSuit || !myPlayer.hand.some(c => c.suit === gameData.leadSuit));

                       return (
                           <button 
                                key={card.id}
                                onClick={() => handleCardClick(card)}
                                disabled={!isMyTurn}
                                style={style}
                                className={`
                                    w-20 h-32 bg-white rounded-xl shadow-lg border relative flex flex-col items-center justify-between p-2 flex-shrink-0 transition-transform transform origin-bottom
                                    ${canPlay ? 'hover:-translate-y-4 cursor-pointer border-slate-300 z-50' : 'brightness-75 translate-y-4 border-slate-400 cursor-not-allowed'}
                                    ${isMandatory ? 'ring-4 ring-amber-500 animate-bounce' : ''}
                                `}
                           >
                                <div className="w-full flex justify-between pointer-events-none">
                                    <span className={`font-bold text-sm ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.display}</span>
                                </div>
                                <div className={`text-3xl ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.suit}</div>
                                <div className="w-full flex justify-between rotate-180 pointer-events-none">
                                    <span className={`font-bold text-sm ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.display}</span>
                                </div>
                           </button>
                       )
                   })}
               </div>
           </div>
       </div>

       {/* BURNT CARDS */}
       {showBurnt && (
           <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900/95 p-4 rounded-xl border border-amber-500 z-50 shadow-2xl">
               <div className="text-xs text-amber-500 font-bold mb-2 uppercase text-center">Burnt Cards</div>
               <div className="flex gap-2">
                   {gameData.burntCards.map(c => (
                       <div key={c.id} className="w-8 h-12 bg-slate-200 rounded flex items-center justify-center text-slate-900 font-bold text-xs">
                           {c.suit}
                       </div>
                   ))}
               </div>
               <button onClick={()=>setShowBurnt(false)} className="w-full mt-2 text-[10px] text-slate-400 uppercase font-bold tracking-wider">Close</button>
           </div>
       )}
    </div>
  );
}