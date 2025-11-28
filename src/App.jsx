import React, { useState, useEffect } from 'react';
import { User, Trophy, Eye, EyeOff, RotateCcw, ShieldAlert, Crown, Smartphone } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';

// --- 🔴 PASTE YOUR FIREBASE CONFIG HERE 🔴 ---
// Replace the object below with the one you copied from the Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyArYds-rUs9lzhU_AaL7c8SCxPOYQGDU2g",
    authDomain: "royalcourt-c9e6e.firebaseapp.com",
    projectId: "royalcourt-c9e6e",
    storageBucket: "royalcourt-c9e6e.firebasestorage.app",
    messagingSenderId: "720774216418",
    appId: "1:720774216418:web:17491eeca417a1e9077cbb"
  }
// --------------------------------------------------

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
  if (type === 'turn') text = "Your turn.";
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

// --- MAIN COMPONENT ---
export default function Game() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. AUTHENTICATION (Simplified for Local Use)
  useEffect(() => {
    // Just sign in anonymously immediately
    signInAnonymously(auth).catch(err => {
        console.error("Auth Error:", err);
        setErrorMsg("Failed to connect to game server.");
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
    
    // Simple root-level collection for your project
    const gameRef = doc(db, 'games', roomCode);
    
    const unsubscribe = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGameData(data);
      } else {
        setErrorMsg("Room closed or does not exist.");
        setGameData(null);
      }
    }, (err) => {
        console.error("Sync error:", err);
        setErrorMsg("Connection lost. Check your internet.");
    });

    return () => unsubscribe();
  }, [user, roomCode]);


  // --- ACTIONS ---

  const handleCreateRoom = async () => {
    if (!playerName.trim()) return setErrorMsg("Enter your name first!");
    const code = generateRoomCode();
    const gameRef = doc(db, 'games', code);
    
    const initialData = {
      roomCode: code,
      hostId: user.uid,
      gameState: 'lobby',
      players: [{
        uid: user.uid,
        name: playerName,
        hand: [],
        status: 'playing',
        id: 0 // Seat index
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
    if (!playerName.trim()) return setErrorMsg("Enter your name first!");
    if (!joinCode.trim()) return setErrorMsg("Enter a room code!");
    
    const code = joinCode.toUpperCase();
    const gameRef = doc(db, 'games', code);
    
    try {
        const docSnap = await getDoc(gameRef);

        if (!docSnap.exists()) return setErrorMsg("Room not found.");
        
        const data = docSnap.data();
        if (data.gameState !== 'lobby') return setErrorMsg("Game already started!");
        if (data.players.length >= 5) return setErrorMsg("Room full!");
        
        // Re-joining check
        if (data.players.some(p => p.uid === user.uid)) {
            setRoomCode(code);
            return;
        }

        const newPlayer = {
            uid: user.uid,
            name: playerName,
            hand: [],
            status: 'playing',
            id: data.players.length
        };

        const newScores = { ...data.scores, [playerName]: 0 };

        await updateDoc(gameRef, {
            players: [...data.players, newPlayer],
            scores: newScores
        });
        setRoomCode(code);
    } catch (e) {
        console.error(e);
        setErrorMsg("Error joining room.");
    }
  };

  const handleStartGame = async () => {
    if (!gameData) return;
    const count = gameData.players.length;
    if (count < 2) return setErrorMsg("Need at least 2 players!");

    let deck = fisherYatesShuffle(createDeck());
    const cardsPerPlayer = count === 4 ? 13 : 10;
    const handSize = count === 5 ? 10 : 13;
    
    let newPlayers = [...gameData.players];
    
    newPlayers = newPlayers.map(p => {
        const hand = deck.splice(0, handSize).sort((a,b) => {
            if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
            return b.rank - a.rank;
        });
        return { ...p, hand, status: 'playing' };
    });

    const burnt = deck; 

    // Determine First Player
    const searchOrder = [...VALUES].reverse(); 
    let starterIndex = 0;
    let starterCard = null;

    for (let val of searchOrder) {
      for (let p of newPlayers) {
        const found = p.hand.find(c => c.suit === '♠️' && c.val === val);
        if (found) {
          starterIndex = p.id;
          starterCard = found;
          break;
        }
      }
      if (starterCard) break;
    }

    const gameRef = doc(db, 'games', roomCode);
    await updateDoc(gameRef, {
        gameState: 'playing',
        players: newPlayers,
        burntCards: burnt,
        currentTurn: starterIndex,
        mandatoryCard: starterCard,
        centerPile: [],
        leadSuit: null,
        gameLog: `${newPlayers[starterIndex].name} has the ${starterCard?.val || '?'}♠️.`
    });
    playSound('start');
  };

  const submitMove = async (playerId, card) => {
    if (!gameData) return;
    
    const gameRef = doc(db, 'games', roomCode);
    
    let newPlayers = [...gameData.players];
    let newPile = [...gameData.centerPile, { playerId, card }];
    
    const playerIndex = newPlayers.findIndex(p => p.id === playerId);
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

    if (isTrickComplete) {
        let highestRank = -1;
        let winnerId = -1;
        newPile.forEach(play => {
            if (play.card.suit === currentLeadSuit && play.card.rank > highestRank) {
                highestRank = play.card.rank;
                winnerId = play.playerId;
            }
        });
        
        updates.centerPile = [];
        updates.leadSuit = null;
        updates.gameLog = `✨ ${newPlayers.find(p=>p.id===winnerId).name} cleared.`;
        playSound('clear');

        const winnerIdx = newPlayers.findIndex(p => p.id === winnerId);
        if (newPlayers[winnerIdx].hand.length === 0) {
            newPlayers[winnerIdx].status = 'safe';
            updates.gameLog += ` ${newPlayers[winnerIdx].name} is SAFE!`;
            
            let nextP = (winnerIdx + 1) % newPlayers.length;
            while (newPlayers[nextP].status === 'safe') {
                nextP = (nextP + 1) % newPlayers.length;
            }
            updates.currentTurn = nextP;
        } else {
            updates.currentTurn = winnerId;
        }
        
        updates.players = newPlayers;
        
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

    let nextIndex = (gameData.currentTurn + 1) % newPlayers.length;
    while (newPlayers[nextIndex].status === 'safe') {
        nextIndex = (nextIndex + 1) % newPlayers.length;
    }
    updates.currentTurn = nextIndex;
    
    await updateDoc(gameRef, updates);
  };

  const handleCardClick = (card) => {
    if (!gameData || gameData.gameState !== 'playing') return;
    
    const myPlayer = gameData.players.find(p => p.uid === user.uid);
    if (!myPlayer) return;

    if (gameData.currentTurn !== myPlayer.id) return; 

    if (gameData.mandatoryCard) {
        if (card.id !== gameData.mandatoryCard.id) {
            alert(`You must play the ${gameData.mandatoryCard.val}♠️!`); 
            return;
        }
    }

    if (gameData.centerPile.length > 0 && gameData.leadSuit) {
        const hasSuit = myPlayer.hand.some(c => c.suit === gameData.leadSuit);
        if (hasSuit && card.suit !== gameData.leadSuit) {
             alert("You must follow suit!");
             return;
        }
    }

    submitMove(myPlayer.id, card);
  };


  // --- UI RENDERERS ---

  if (loading) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white">Loading Royal Court...</div>;

  // LOBBY VIEW
  if (!gameData || gameData.gameState === 'lobby') {
     if (gameData && roomCode) {
         return (
             <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
                 <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-md w-full text-center">
                    <Crown className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Room: {roomCode}</h2>
                    <p className="text-slate-400 mb-6">Waiting for host to start...</p>
                    
                    <div className="space-y-2 mb-8 text-left">
                        {gameData.players.map((p, i) => (
                            <div key={i} className="flex items-center gap-3 bg-slate-900 p-3 rounded-lg border border-slate-700">
                                <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-xs font-bold">{i+1}</div>
                                <span>{p.name} {p.uid === user.uid && "(You)"}</span>
                                {i === 0 && <Crown size={14} className="text-amber-500 ml-auto" />}
                            </div>
                        ))}
                    </div>

                    {gameData.hostId === user.uid ? (
                        <button onClick={handleStartGame} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 rounded-xl transition-all">
                            Start Game
                        </button>
                    ) : (
                        <div className="text-xs text-slate-500 animate-pulse">Host controls the start...</div>
                    )}
                 </div>
             </div>
         )
     }

     return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <Crown className="w-20 h-20 text-amber-500 mx-auto mb-4" />
                    <h1 className="text-4xl font-serif font-bold">Royal Court</h1>
                    <p className="text-slate-400 mt-2">Multiplayer Edition</p>
                </div>

                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-6">
                    {errorMsg && <div className="bg-rose-500/20 text-rose-300 p-3 rounded text-sm text-center border border-rose-500/50">{errorMsg}</div>}
                    
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Your Name</label>
                        <input 
                            value={playerName}
                            onChange={e => setPlayerName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                            placeholder="e.g. AcePlayer"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={handleCreateRoom} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-4 rounded-xl flex flex-col items-center gap-2 transition-all">
                            <Smartphone size={24} />
                            Create Room
                        </button>
                        <div className="space-y-2">
                             <input 
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="CODE"
                                maxLength={4}
                                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-2 py-2 text-center text-white font-mono tracking-widest uppercase focus:outline-none focus:border-emerald-500"
                             />
                             <button onClick={handleJoinRoom} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-xl text-sm">
                                Join Game
                             </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
     );
  }

  const myPlayer = gameData.players.find(p => p.uid === user.uid);
  const isMyTurn = gameData.currentTurn === myPlayer.id;

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex flex-col text-slate-200 font-sans overflow-hidden select-none">
       {/* HEADER */}
       <div className="h-14 bg-slate-950/80 backdrop-blur border-b border-slate-700 flex items-center justify-between px-4 z-30">
          <div className="flex items-center gap-2">
              <span className="font-mono bg-slate-800 px-2 py-1 rounded text-amber-400 border border-slate-600 text-xs tracking-widest">{roomCode}</span>
              <span className="text-xs text-slate-400 hidden sm:inline">Room Code</span>
          </div>
          <div className="flex gap-2">
             {gameData.players.length === 5 && (
                <button onClick={() => setShowBurnt(!showBurnt)} className="p-2 bg-slate-800 rounded-full">
                    {showBurnt ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
             )}
          </div>
       </div>

       {/* LOG */}
       <div className="absolute top-16 w-full flex justify-center z-20">
           <div className="bg-slate-900/90 backdrop-blur px-6 py-2 rounded-full border border-slate-700 shadow-xl text-sm text-amber-100 animate-pulse">
               {gameData.gameLog}
           </div>
       </div>

       {/* OPPONENTS */}
       <div className="mt-16 flex justify-center gap-4 px-2">
           {gameData.players.filter(p => p.uid !== user.uid).map(p => (
               <div key={p.id} className={`flex flex-col items-center transition-all ${gameData.currentTurn === p.id ? 'scale-110 opacity-100' : 'opacity-60 scale-95'}`}>
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 bg-slate-800 relative
                       ${gameData.currentTurn === p.id ? 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)]' : 'border-slate-600'}
                   `}>
                       {p.status === 'safe' ? <Crown className="text-emerald-400 w-5 h-5" /> : <User className="text-slate-400 w-5 h-5" />}
                       {p.status === 'playing' && (
                           <div className="absolute -bottom-1 bg-slate-950 text-white text-[10px] px-1.5 py-0.5 rounded-full border border-slate-700 font-bold">
                               {p.hand.length}
                           </div>
                       )}
                   </div>
                   <span className="text-[9px] mt-1 font-bold uppercase tracking-wider text-slate-400">{p.name}</span>
               </div>
           ))}
       </div>

       {/* TABLE */}
       <div className="flex-1 flex items-center justify-center relative perspective-[1000px]">
            <div className="relative w-24 h-32 flex items-center justify-center">
                {gameData.centerPile.length === 0 && (
                     <div className="w-full h-full border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center opacity-30">
                         <div className="text-[10px] uppercase font-bold text-slate-400">Empty</div>
                     </div>
                )}
                {gameData.centerPile.map((play, i) => (
                    <div 
                        key={i}
                        className="absolute w-24 h-36 bg-white rounded-lg shadow-xl border border-slate-200 flex flex-col items-center justify-center transition-all"
                        style={{
                            transform: `rotate(${(i - gameData.centerPile.length/2) * 10}deg) translateY(${i * -2}px)`,
                            zIndex: i
                        }}
                    >
                        <span className={`text-2xl ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.suit}</span>
                        <span className={`font-bold text-lg ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.display}</span>
                        <div className="absolute bottom-1 text-[8px] text-slate-400 uppercase font-bold">{gameData.players.find(p=>p.id===play.playerId).name}</div>
                    </div>
                ))}
            </div>
       </div>

       {/* MY HAND */}
       <div className="mb-4 flex flex-col items-center">
           <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isMyTurn ? 'text-amber-400' : 'text-slate-600'}`}>
               {isMyTurn ? "Your Turn" : "Waiting..."}
           </div>
           
           <div className="h-40 w-full flex justify-center overflow-x-auto px-4 pb-4">
               <div className="flex items-end -space-x-8 min-w-min">
                   {myPlayer.hand.map((card, idx) => {
                       const isMandatory = gameData.mandatoryCard && card.id === gameData.mandatoryCard.id;
                       const canPlay = isMyTurn && 
                                       (!gameData.mandatoryCard || isMandatory) && 
                                       (gameData.centerPile.length === 0 || card.suit === gameData.leadSuit || !myPlayer.hand.some(c => c.suit === gameData.leadSuit));

                       return (
                           <button 
                                key={card.id}
                                onClick={() => handleCardClick(card)}
                                disabled={!isMyTurn}
                                style={{ zIndex: idx }}
                                className={`
                                    w-24 h-36 bg-white rounded-xl shadow-lg border relative flex flex-col items-center justify-between p-2 flex-shrink-0 transition-transform
                                    ${canPlay ? 'hover:-translate-y-6 cursor-pointer border-slate-300' : 'brightness-75 translate-y-4 border-slate-400 cursor-not-allowed'}
                                    ${isMandatory ? 'ring-4 ring-amber-500 animate-bounce' : ''}
                                `}
                           >
                                <div className="w-full flex justify-between pointer-events-none">
                                    <span className={`font-bold ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.display}</span>
                                    <span className={`text-xs ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.suit}</span>
                                </div>
                                <div className={`text-4xl ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.suit}</div>
                                <div className="w-full flex justify-between rotate-180 pointer-events-none">
                                    <span className={`font-bold ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.display}</span>
                                    <span className={`text-xs ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.suit}</span>
                                </div>
                           </button>
                       )
                   })}
               </div>
           </div>
       </div>

       {/* BURNT CARDS OVERLAY */}
       {showBurnt && (
           <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900/95 p-4 rounded-xl border border-amber-500 z-50">
               <div className="text-xs text-amber-500 font-bold mb-2 uppercase text-center">Burnt Cards</div>
               <div className="flex gap-2">
                   {gameData.burntCards.map(c => (
                       <div key={c.id} className="w-10 h-14 bg-slate-200 rounded flex items-center justify-center text-slate-900 font-bold text-sm">
                           {c.suit}
                       </div>
                   ))}
               </div>
               <button onClick={()=>setShowBurnt(false)} className="w-full mt-2 text-xs text-slate-400">Close</button>
           </div>
       )}
    </div>
  );
}