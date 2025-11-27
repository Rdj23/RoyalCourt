import React, { useState, useEffect } from 'react';
import { User, Trophy, Eye, EyeOff, RotateCcw, ShieldAlert, Crown } from 'lucide-react';

// --- CONSTANTS & ASSETS ---
const SUITS = ['♠️', '♥️', '♣️', '♦️'];
const SUIT_ORDER = { '♠️': 0, '♥️': 1, '♣️': 2, '♦️': 3 }; // Spades first
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

// Visual Helpers
const getSuitStyle = (suit) => {
  if (suit === '♥️' || suit === '♦️') return 'text-rose-500';
  return 'text-slate-200';
};

// Sound Effect Helper
const playSound = (type) => {
  if (!window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  let text = "";
  
  if (type === 'cut') text = "Cut!";
  if (type === 'clear') text = "Clear.";
  if (type === 'win') text = "Round Over.";
  if (type === 'start') text = "Place your bets.";
  
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
      deck.push({ 
        suit, 
        val, 
        rank: RANK_VALUE[val], 
        id: `${val}${suit}`,
        display: `${val}`
      });
    });
  });
  return deck;
};

// Fisher-Yates Shuffle - The Gold Standard for Randomness
const fisherYatesShuffle = (deck) => {
  let newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export default function Game() {
  // --- STATE ---
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState([]); 
  const [gameState, setGameState] = useState('setup'); // setup, playing, finished
  const [centerPile, setCenterPile] = useState([]); 
  const [burntCards, setBurntCards] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [gameLog, setGameLog] = useState("Welcome to the High Stakes Table.");
  const [leadSuit, setLeadSuit] = useState(null);
  const [showBurnt, setShowBurnt] = useState(false);
  const [winners, setWinners] = useState([]);
  
  // Enforce specific card play
  const [mandatoryCard, setMandatoryCard] = useState(null);
  const [isFirstMoveOfGame, setIsFirstMoveOfGame] = useState(true);
  
  // Scoreboard
  const [scores, setScores] = useState({ "You": 0, "Bot 1": 0, "Bot 2": 0, "Bot 3": 0, "Bot 4": 0 });
  const [roundLoser, setRoundLoser] = useState(null);
  
  // Bot Memory
  const [avoidSuits, setAvoidSuits] = useState([]); 

  // --- SETUP ---
  const startGame = (count) => {
    playSound('start');
    setPlayerCount(count);
    const deck = fisherYatesShuffle(createDeck());
    const newPlayers = [];
    let burnt = [];

    // Distribute
    const cardsPerPlayer = count === 4 ? 13 : 10;
    
    for (let i = 0; i < count; i++) {
        const hand = deck.splice(0, cardsPerPlayer).sort((a,b) => {
            if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
            return b.rank - a.rank;
        });
        
        newPlayers.push({ 
            id: i, 
            name: i === 0 ? "You" : `Bot ${i}`, 
            hand, 
            isBot: i !== 0, 
            status: 'playing' 
        });
    }
    
    if (count === 5) {
        burnt = deck; 
        setShowBurnt(true); // Show burnt cards immediately for clarity
    } else {
        setShowBurnt(false);
    }

    setPlayers(newPlayers);
    setBurntCards(burnt);
    setCenterPile([]);
    setLeadSuit(null);
    setWinners([]);
    setAvoidSuits([]);
    setMandatoryCard(null);
    setIsFirstMoveOfGame(true);
    setRoundLoser(null);
    setGameState('playing');

    findFirstPlayer(newPlayers, burnt);
  };

  const findFirstPlayer = (currentPlayers, burnt) => {
    const searchOrder = [...VALUES].reverse(); // A, K, Q...
    let starterIndex = -1;
    let starterCard = null;

    // Scan for highest spade
    for (let val of searchOrder) {
      for (let p of currentPlayers) {
        const found = p.hand.find(c => c.suit === '♠️' && c.val === val);
        if (found) {
          starterIndex = p.id;
          starterCard = found;
          break;
        }
      }
      if (starterIndex !== -1) break;
    }

    setCurrentTurn(starterIndex);
    setMandatoryCard(starterCard); // GLOBAL LOCK: This card MUST be played next.

    const isAceBurnt = burnt.some(c => c.suit === '♠️' && c.val === 'A');
    const starterName = currentPlayers[starterIndex].name;

    if (starterIndex === 0) {
        setGameLog(isAceBurnt 
            ? `Ace is Burnt! You have the ${starterCard.val}♠️. Tap it to start.` 
            : `You have the Ace of Spades! Tap it to start.`);
    } else {
        setGameLog(isAceBurnt 
            ? `Ace is Burnt. ${starterName} has the ${starterCard.val}♠️.` 
            : `${starterName} has the Ace of Spades.`);
    }
  };

  // --- CORE LOGIC ---

  const handlePlayerClick = (card) => {
    if (gameState !== 'playing' || currentTurn !== 0) return;
    
    // 1. Mandatory First Move Check
    if (mandatoryCard) {
        if (card.id === mandatoryCard.id) {
            playCardLogic(0, card);
            return;
        } else {
            setGameLog(`⚠️ You MUST play the ${mandatoryCard.val}♠️ first!`);
            return;
        }
    }

    // 2. Follow Suit Check
    if (centerPile.length > 0) {
      const player = players[0];
      const hasSuit = player.hand.some(c => c.suit === leadSuit);
      if (hasSuit && card.suit !== leadSuit) {
        setGameLog("❌ You must follow suit!");
        return;
      }
    }

    playCardLogic(0, card);
  };

  const playCardLogic = (playerId, card) => {
    const newPlayers = [...players];
    const player = newPlayers[playerId];
    
    // Play card
    player.hand = player.hand.filter(c => c.id !== card.id);
    setPlayers(newPlayers);

    const newPile = [...centerPile, { playerId, card }];
    setCenterPile(newPile);

    // If this was the mandatory first move, clear the lock
    if (mandatoryCard) {
        setMandatoryCard(null);
        setIsFirstMoveOfGame(false);
    }

    // Set Lead Suit
    let currentLeadSuit = leadSuit;
    if (newPile.length === 1) {
      currentLeadSuit = card.suit;
      setLeadSuit(card.suit);
    }

    // CHECK CUT
    const isDifferentSuit = card.suit !== currentLeadSuit;
    
    if (isDifferentSuit && centerPile.length > 0) {
      setTimeout(() => resolveCut(newPile, currentLeadSuit, playerId, card), 800);
      return;
    }

    // CHECK TRICK END
    const activeCount = players.filter(p => p.status === 'playing').length;
    if (newPile.length === activeCount) {
      setTimeout(() => resolveClear(newPile, currentLeadSuit), 800);
    } else {
      advanceTurn(playerId);
    }
  };

  const resolveCut = (pile, suit, cutterId, cutCard) => {
    playSound('cut');
    
    // Identify Victim (Highest of Lead Suit)
    let highestRank = -1;
    let victimId = -1;

    pile.forEach(play => {
      if (play.card.suit === suit && play.card.rank > highestRank) {
        highestRank = play.card.rank;
        victimId = play.playerId;
      }
    });

    const victim = players[victimId];
    const cutter = players[cutterId];
    
    setGameLog(`⚔️ ${cutter.name} CUTS! ${victim.name} picks up.`);
    
    if (victim.isBot) setAvoidSuits(prev => [...prev, suit]);

    // Give cards to Victim
    const newPlayers = [...players];
    const pickupCards = pile.map(p => p.card);
    newPlayers[victimId].hand = [...newPlayers[victimId].hand, ...pickupCards];
    
    // Re-sort Victim Hand
    newPlayers[victimId].hand.sort((a,b) => {
        if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
        return b.rank - a.rank;
    });

    setPlayers(newPlayers);
    setCenterPile([]);
    setLeadSuit(null);
    checkSafePlayers(newPlayers);
    
    // Victim leads
    setCurrentTurn(victimId);
  };

  const resolveClear = (pile, suit) => {
    playSound('clear');
    
    let highestRank = -1;
    let winnerId = -1;

    pile.forEach(play => {
      if (play.card.suit === suit && play.card.rank > highestRank) {
        highestRank = play.card.rank;
        winnerId = play.playerId;
      }
    });

    const winner = players[winnerId];
    
    // Pass Lead Logic
    let nextTurn = winnerId;
    
    // If Winner is now Safe (0 cards), they cannot lead. Pass to left.
    if (players[winnerId].hand.length === 0) {
        setGameLog(`✨ ${winner.name} cleared and is SAFE! Lead passes.`);
        
        let nextP = (winnerId + 1) % playerCount;
        let loops = 0;
        while ((players[nextP].status === 'safe' || (players[nextP].hand.length === 0 && nextP !== winnerId)) && loops < playerCount) {
             nextP = (nextP + 1) % playerCount;
             loops++;
        }
        nextTurn = nextP;
    } else {
        setGameLog(`✨ ${winner.name} cleared the trick.`);
    }

    setCenterPile([]);
    setLeadSuit(null);
    setAvoidSuits(prev => prev.filter(s => s !== suit));

    checkSafePlayers([...players]);
    setCurrentTurn(nextTurn);
  };

  const checkSafePlayers = (currentPlayers) => {
    currentPlayers.forEach(p => {
      if (p.hand.length === 0 && p.status === 'playing') {
        p.status = 'safe';
        setGameLog(`🏆 ${p.name} is Safe!`);
        setWinners(prev => [...prev, p.name]);
      }
    });

    const remaining = currentPlayers.filter(p => p.status === 'playing');
    if (remaining.length <= 1) {
      endRound(remaining[0]?.name || "Everyone");
    }
    setPlayers(currentPlayers);
  };

  const endRound = (loserName) => {
      setGameState('finished');
      setRoundLoser(loserName);
      playSound('win');
      
      setScores(prev => ({
          ...prev,
          [loserName]: prev[loserName] + 1
      }));
  };

  const advanceTurn = (currentIndex) => {
    let nextIndex = (currentIndex + 1) % playerCount;
    let loopCheck = 0;
    while (players[nextIndex].status === 'safe' && loopCheck < playerCount) {
       nextIndex = (nextIndex + 1) % playerCount;
       loopCheck++;
    }
    setCurrentTurn(nextIndex);
  };

  // --- BOT LOGIC ---
  useEffect(() => {
    if (gameState !== 'playing') return;
    
    const currentPlayer = players[currentTurn];
    
    // Skip if safe
    if (currentPlayer && currentPlayer.status === 'safe') {
        advanceTurn(currentTurn);
        return;
    }

    if (currentPlayer && currentPlayer.isBot && currentPlayer.status === 'playing') {
      const timer = setTimeout(() => botTurn(currentPlayer), 1200); 
      return () => clearTimeout(timer);
    }
  }, [currentTurn, gameState, players, mandatoryCard]); // Re-run if turn changes

  const botTurn = (bot) => {
    let cardToPlay = null;

    // 1. MANDATORY MOVE CHECK 
    if (mandatoryCard) {
        if (bot.id === currentTurn) { 
             cardToPlay = bot.hand.find(c => c.id === mandatoryCard.id);
             if (cardToPlay) {
                 playCardLogic(bot.id, cardToPlay);
                 return;
             }
        }
    }

    // 2. Standard Logic
    if (centerPile.length === 0) {
      // --- SMART LEAD SELECTION ---
      const suitsInHand = {};
      bot.hand.forEach(c => {
          if(!suitsInHand[c.suit]) suitsInHand[c.suit] = [];
          suitsInHand[c.suit].push(c);
      });

      const validSuits = Object.keys(suitsInHand).filter(s => !avoidSuits.includes(s));
      const suitsToChooseFrom = validSuits.length > 0 ? validSuits : Object.keys(suitsInHand);

      const chosenSuit = suitsToChooseFrom[Math.floor(Math.random() * suitsToChooseFrom.length)];
      const cardsOfSuit = suitsInHand[chosenSuit];
      
      // AI Decision: 
      // If we have Ace or King, play it to clear safely.
      // If we don't, randomize slightly to be unpredictable.
      const hasPowerCard = cardsOfSuit.some(c => c.rank >= 13); // K or A
      
      if (hasPowerCard) {
          cardToPlay = cardsOfSuit[0]; // Play Highest (Power Clear)
      } else {
          // 30% chance to play lowest to sneak by, 70% to play highest
          const playHigh = Math.random() > 0.3;
          cardToPlay = playHigh ? cardsOfSuit[0] : cardsOfSuit[cardsOfSuit.length - 1];
      }

    } else {
      // --- SMART FOLLOW ---
      const hasSuit = bot.hand.filter(c => c.suit === leadSuit);
      if (hasSuit.length > 0) {
        // If we have the Ace/King, play it to ensure we win & clear.
        // Otherwise, standard play.
        cardToPlay = hasSuit[0]; 
      } else {
        // --- CUTTING ---
        // Always throw lowest junk card
        cardToPlay = bot.hand[bot.hand.length - 1]; 
      }
    }
    playCardLogic(bot.id, cardToPlay);
  };

  // --- UI COMPONENTS ---
  
  const getHandStyle = (idx, total) => {
    const baseOffset = -45; 
    let squeeze = baseOffset;
    if (total > 15) squeeze = -50;
    if (total < 5) squeeze = -20;
    
    return {
        marginLeft: idx === 0 ? '0px' : `${squeeze}px`,
        zIndex: idx
    };
  };

  if (gameState === 'setup') {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 font-sans text-slate-200">
        <div className="max-w-md w-full bg-[#1e293b] p-8 rounded-3xl shadow-2xl border border-slate-700 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500"></div>
          <Crown className="w-16 h-16 text-amber-400 mx-auto mb-4" strokeWidth={1.5} />
          <h1 className="text-5xl font-serif text-white mb-2 tracking-tight">Royal Court</h1>
          <p className="text-slate-400 mb-8 uppercase tracking-widest text-xs font-bold">High Stakes Survival</p>
          
          <div className="space-y-3 mb-8">
            <button onClick={() => startGame(4)} className="w-full bg-slate-800 hover:bg-amber-500 hover:text-slate-900 text-white py-4 rounded-xl transition-all duration-300 flex items-center justify-between px-6 border border-slate-700 group">
              <span className="font-bold text-lg">4 Players</span>
              <span className="text-sm opacity-60 group-hover:opacity-100">13 Cards</span>
            </button>
            <button onClick={() => startGame(5)} className="w-full bg-slate-800 hover:bg-amber-500 hover:text-slate-900 text-white py-4 rounded-xl transition-all duration-300 flex items-center justify-between px-6 border border-slate-700 group">
              <span className="font-bold text-lg">5 Players</span>
              <span className="text-sm opacity-60 group-hover:opacity-100">10 Cards + Burnt</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-700">
             <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Total Losses</h3>
             <div className="flex flex-wrap justify-center gap-3 text-xs">
                 {Object.entries(scores).map(([k,v]) => (
                     <div key={k} className="flex flex-col items-center bg-slate-900 px-3 py-1 rounded">
                         <span className={v > 0 ? "text-rose-400 font-bold" : "text-slate-500"}>{v}</span>
                         <span className="text-slate-500 text-[10px]">{k}</span>
                     </div>
                 ))}
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex flex-col text-slate-200 font-sans overflow-hidden select-none">
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

      {/* TOP BAR */}
      <div className="h-14 bg-[#1e293b]/95 backdrop-blur border-b border-slate-700 flex items-center justify-between px-4 z-30 shadow-lg">
        <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <span className="font-serif font-bold text-lg text-slate-100">Royal Court</span>
        </div>
        
        <div className="flex items-center gap-3">
            {playerCount === 5 && (
                <button 
                  onClick={() => setShowBurnt(!showBurnt)} 
                  className={`flex items-center gap-1 text-[10px] px-3 py-1 rounded-full border transition-colors uppercase tracking-wide font-bold ${showBurnt ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                >
                    {showBurnt ? <Eye size={12} /> : <EyeOff size={12} />} Burnt Cards
                </button>
            )}
        </div>
      </div>

      {/* BURNT CARDS MODAL (Prominent) */}
      {showBurnt && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-[#1e293b] p-4 rounded-xl border border-amber-500/50 shadow-2xl animate-in fade-in zoom-in-95 flex flex-col items-center gap-2">
            <div className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">Removed from Deck</div>
            <div className="flex gap-3">
                {burntCards.map(c => (
                    <div key={c.id} className="w-12 h-16 bg-slate-200 rounded-md flex flex-col items-center justify-center text-slate-900 shadow-md">
                        <span className={`text-lg font-bold ${getSuitStyle(c.suit).replace('text-slate-200', 'text-slate-900')}`}>{c.display}</span>
                        <span className={`text-lg ${getSuitStyle(c.suit).replace('text-slate-200', 'text-slate-900')}`}>{c.suit}</span>
                    </div>
                ))}
            </div>
            <button onClick={() => setShowBurnt(false)} className="mt-2 text-[10px] text-slate-400 hover:text-white underline">Close</button>
        </div>
      )}

      {/* GAME LOG */}
      <div className="absolute top-16 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <div className="bg-slate-900/90 backdrop-blur-md text-amber-100 px-6 py-2 rounded-b-xl text-xs sm:text-sm shadow-xl border-b border-x border-slate-700/50 animate-pulse text-center max-w-sm mx-4">
              {gameLog}
          </div>
      </div>

      {/* MAIN GAME AREA */}
      <div className="flex-1 flex flex-col relative z-10 pt-16">
        
        {/* OPPONENTS */}
        <div className="flex justify-center gap-4 sm:gap-8 mt-4 px-2">
          {players.filter(p => p.isBot).map(p => (
            <div key={p.id} className={`flex flex-col items-center transition-all duration-300 ${currentTurn === p.id ? 'opacity-100 scale-105' : 'opacity-60 scale-95'}`}>
               <div className={`
                 w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2 relative bg-slate-800
                 ${currentTurn === p.id ? 'border-amber-400 shadow-amber-500/30' : 'border-slate-600'}
                 ${p.status === 'safe' ? 'border-emerald-500' : ''}
               `}>
                  {p.status === 'safe' ? <Crown className="text-emerald-400 w-5 h-5" /> : <User className="text-slate-400 w-5 h-5" />}
                  {p.status === 'playing' && (
                     <div className="absolute -bottom-1 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded-full border border-slate-700 font-bold">
                        {p.hand.length}
                     </div>
                  )}
               </div>
               <div className="mt-1 text-[9px] font-bold tracking-wider text-slate-400 uppercase">{p.name}</div>
            </div>
          ))}
        </div>

        {/* CENTER TABLE */}
        <div className="flex-1 flex items-center justify-center perspective-[1000px] min-h-[220px]">
           <div className="relative w-full max-w-xs h-48 flex items-center justify-center">
             {centerPile.length === 0 && (
                <div className="w-28 h-40 rounded-xl border-2 border-dashed border-slate-700/50 flex flex-col items-center justify-center opacity-30">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Table Clear</div>
                </div>
             )}
             
             {centerPile.map((play, index) => (
               <div 
                 key={play.card.id}
                 className="absolute w-24 h-36 bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col items-center justify-between p-2 transition-all duration-500 ease-out"
                 style={{
                   zIndex: index,
                   transform: `rotate(${(index - (centerPile.length-1)/2) * 8}deg) translateY(${index * -2}px)`,
                   boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'
                 }}
               >
                 <div className="w-full flex justify-between">
                     <span className={`text-lg font-bold font-serif ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.display}</span>
                     <span className={`text-sm ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.suit}</span>
                 </div>
                 <div className={`text-3xl ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.suit}</div>
                 <div className="w-full flex justify-between rotate-180">
                     <span className={`text-lg font-bold font-serif ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.display}</span>
                     <span className={`text-sm ${getSuitStyle(play.card.suit).replace('text-slate-200', 'text-slate-900')}`}>{play.card.suit}</span>
                 </div>
                 <div className="absolute -bottom-5 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-full">{players[play.playerId].name}</div>
               </div>
             ))}
           </div>
        </div>

        {/* PLAYER HAND */}
        <div className="mt-auto mb-2 w-full flex flex-col items-center">
           <div className="text-center mb-1">
             <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${currentTurn === 0 ? 'text-amber-400 animate-pulse' : 'text-slate-600'}`}>
                {currentTurn === 0 ? "Your Turn" : "Opponent's Turn"}
             </span>
           </div>

           <div className="h-44 w-full flex justify-center overflow-hidden px-2 relative">
              <div className="flex items-end justify-center h-full pt-4 pb-2">
                {players[0]?.hand.map((card, idx) => {
                    const isMyTurn = currentTurn === 0;
                    const isMandatory = mandatoryCard && card.id === mandatoryCard.id;
                    const isBlocked = mandatoryCard && card.id !== mandatoryCard.id;
                    
                    const canPlay = isMyTurn && !isBlocked && (centerPile.length === 0 || card.suit === leadSuit || !players[0].hand.some(c => c.suit === leadSuit));
                    
                    return (
                        <div 
                            key={card.id}
                            style={getHandStyle(idx, players[0].hand.length)}
                            className="relative group transition-all duration-300"
                        >
                            <button 
                                onClick={() => handlePlayerClick(card)}
                                disabled={!isMyTurn}
                                className={`
                                    w-24 h-36 bg-white rounded-xl shadow-xl border 
                                    flex flex-col items-center justify-between p-2
                                    transition-transform duration-200 transform origin-bottom
                                    ${isMandatory ? 'ring-4 ring-amber-500 z-50 animate-bounce -translate-y-4' : ''}
                                    ${canPlay ? 'hover:-translate-y-6 hover:z-50 cursor-pointer border-slate-300' : 'cursor-not-allowed brightness-75 border-slate-400 translate-y-4'}
                                `}
                            >
                                <div className="w-full flex justify-between pointer-events-none">
                                    <span className={`text-lg font-serif font-bold ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.display}</span>
                                    <span className={`text-xs ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.suit}</span>
                                </div>
                                <div className={`text-4xl pointer-events-none ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.suit}</div>
                                <div className="w-full flex justify-between rotate-180 pointer-events-none">
                                    <span className={`text-lg font-serif font-bold ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.display}</span>
                                    <span className={`text-xs ${getSuitStyle(card.suit).replace('text-slate-200', 'text-slate-900')}`}>{card.suit}</span>
                                </div>
                            </button>
                        </div>
                    )
                })}
              </div>
           </div>
        </div>
      </div>

      {/* SCORECARD / GAME OVER */}
      {gameState === 'finished' && (
        <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6">
            <div className="bg-[#1e293b] p-8 rounded-3xl border border-slate-700 shadow-2xl max-w-md w-full text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500"></div>
                
                <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-4" />
                <h2 className="text-3xl font-serif text-white mb-1">Round Complete</h2>
                <p className="text-slate-400 text-sm mb-6 uppercase tracking-wide">Scorecard Updated</p>
                
                <div className="bg-slate-900 rounded-2xl p-6 mb-8 border border-slate-800">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 pb-4 border-b border-slate-800 mb-2">
                            <span className="text-xs uppercase tracking-widest text-slate-500 block mb-1">Round Loser</span>
                            <span className="text-2xl text-rose-500 font-bold">{roundLoser}</span>
                        </div>
                        
                        {/* Full Scorecard List */}
                        {Object.entries(scores).map(([name, val]) => (
                            <div key={name} className="flex justify-between items-center px-2">
                                <span className={name === roundLoser ? "text-rose-400 font-bold" : "text-slate-400"}>{name}</span>
                                <div className="flex items-center gap-2">
                                    <div className="h-1 w-12 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-500" style={{ width: `${Math.min(val * 10, 100)}%` }}></div>
                                    </div>
                                    <span className="text-white font-mono">{val}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={() => startGame(playerCount)} 
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
                >
                    <RotateCcw size={20} />
                    Deal Next Hand
                </button>
            </div>
        </div>
      )}
    </div>
  );
}