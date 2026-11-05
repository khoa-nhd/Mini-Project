import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Sparkles, Gift, Zap, Gem, Volume2, VolumeX } from 'lucide-react';
import { RARITY_STYLES, type Chest, type Drop, type OpenResponse, type Rarity } from './types.js';
import { ParticleBurst } from './ParticleBurst.js';
import { sfx, setMuted } from './sound.js';

/* ------------------------------------------------------------------ *
 * Flow state machine:
 *   catalog → opening (build-up shake, length encodes best pull rarity)
 *           → reveal (cards one-by-one, fanfare per rarity)
 *           → summary (10x grid + NEW/dup badges) → catalog
 * All randomness was resolved server-side before a single pixel moves —
 * the animation only presents facts the API already returned.
 * ------------------------------------------------------------------ */

type Phase = 'loading' | 'catalog' | 'opening' | 'reveal' | 'summary';

interface ProfileResponse {
  player: { sparkles: number; gems: number; owned: Record<string, number>; equippedItemId?: string; totalPulls: number };
  daily?: { canClaim: boolean; amount: number; nextClaimAt: number };
  chests: { id: string; pullsUntilHardPity: number; pullsUntilGuarantee: number }[];
}

const PULLS_QTY = 10;

/** Tension window per reveal: commons pop fast, legendaries breathe. */
const REVEAL_MS: Record<Rarity, number> = {
  common: 700,
  rare: 1100,
  epic: 1600,
  legendary: 2400,
};

/** Build-up duration scales with the best pull in the batch — the player
 *  feels the stakes rising *before* they know why. */
function buildUpMs(best: Rarity): number {
  switch (best) {
    case 'common':
      return 900;
    case 'rare':
      return 1400;
    case 'epic':
      return 2200;
    case 'legendary':
      return 3200;
  }
}

function bestRarityOf(drops: Drop[]): Rarity {
  const rank: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  return drops.reduce<Rarity>(
    (best, d) => (rank.indexOf(d.rarity) > rank.indexOf(best) ? d.rarity : best),
    'common'
  );
}

export const GachaModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [chests, setChests] = useState<Chest[]>([]);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [selectedChest, setSelectedChest] = useState<Chest | null>(null);
  const [opens, setOpens] = useState<OpenResponse[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(0); // reveal card timer anchor
  const [muted, setMutedState] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [dailyReady, setDailyReady] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    clearTimers();
    setPhase('loading');
    setNotice(null);
    Promise.all([
      fetch('/api/gacha/chests').then((r) => r.json()),
      fetch('/api/gacha/profile').then((r) => r.json()),
    ])
      .then(([catalog, prof]: [any, ProfileResponse]) => {
        setChests(catalog.chests);
        setProfile(prof);
        setDailyReady(prof.daily?.canClaim ?? true);
        setPhase('catalog');
      })
      .catch(() => setPhase('catalog'));
    return clearTimers;
  }, [isOpen, clearTimers]);

  // Reveal sequencing: bold rarity → fanfare → advance.
  useEffect(() => {
    if (phase !== 'reveal' || !opens.length) return;
    const allDropsCount = opens.reduce((sum, o) => sum + o.drops.length, 0);
    if (revealIndex >= allDropsCount) {
      later(() => setPhase('summary'), 250);
      return;
    }
    const drop = dropAt(revealIndex, opens);
    if (drop) sfx.reveal(drop.rarity);
    later(() => setRevealIndex((i) => i + 1), REVEAL_MS[drop?.rarity ?? 'common']);
    return undefined;
  }, [phase, revealIndex, opens, later]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (phase === 'catalog' || phase === 'summary')) onClose();
      if (e.key === ' ' && phase === 'opening') setPhase('reveal'); // skip button parity
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, phase, onClose]);

  if (!isOpen) return null;

  const balance = profile?.player;

  const refreshProfile = async () => {
    try {
      const res = await fetch('/api/gacha/profile');
      if (res.ok) {
        const prof: ProfileResponse = await res.json();
        setProfile(prof);
        setDailyReady(prof.daily?.canClaim ?? true);
      }
    } catch {
      /* offline: keep current numbers */
    }
  };

  const handleClaimDaily = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/gacha/claim-daily', { method: 'POST' });
      if (res.ok) {
        sfx.coins();
        setDailyReady(false);
        await refreshProfile();
      } else {
        const data = await res.json().catch(() => null);
        sfx.error();
        setNotice(data?.error || 'Could not claim the daily bonus.');
      }
    } finally {
      setClaiming(false);
    }
  };

  /** Server-authoritative open: results arrive before any animation starts. */
  const handleOpen = async (chest: Chest, qty: 1 | typeof PULLS_QTY) => {
    setNotice(null);
    sfx.click();
    const currency: 'sparkles' | 'gems' = chest.gemCost && balance && balance.sparkles < chest.sparkleCost * qty ? 'gems' : 'sparkles';
    try {
      const res = await fetch('/api/gacha/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chest: chest.id,
          qty,
          currency,
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        sfx.error();
        setNotice(data?.error || 'Opening failed. Try again.');
        return;
      }
      const data: OpenResponse = await res.json();
      setOpens([data]);
      setProfile((prev) => (prev ? { ...prev, player: data.player } : prev));
      setSelectedChest(chest);
      setRevealIndex(0);
      setStartedAt(Date.now());
      // Build-up: shake escalates, then crack open into reveal phase.
      setPhase('opening');
      const best = bestRarityOf(data.drops);
      const shakeFx = window.setInterval(() => sfx.shakeTick(0.5 + Math.random() * 0.5), 160);
      void shakeFx;
      later(() => window.clearInterval(shakeFx), buildUpMs(best) - 200);
      later(() => {
        sfx.crack();
        setPhase('reveal');
      }, buildUpMs(best));
    } catch {
      sfx.error();
      setNotice('Network error — your coins were not spent.');
    }
  };

  const handleEquip = async (itemId: string) => {
    sfx.click();
    try {
      const res = await fetch('/api/gacha/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok && profile) {
        setProfile({ ...profile, player: { ...profile.player, equippedItemId: itemId } });
      }
    } catch {
      /* ignore transient equip failures */
    }
  };

  const allDrops = opens.flatMap((o) => o.drops);
  const currentDrop = dropAt(revealIndex, opens);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      {phase === 'catalog' && (
        <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-600/30">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white tracking-tight">Treasure Desk</h2>
                <p className="text-[11px] text-slate-400">Earn ✨ by generating quizzes. Odds shown are the true odds.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BalanceChip icon={<Sparkles className="w-3.5 h-3.5" />} value={balance?.sparkles ?? 0} title="Sparkles" />
              <BalanceChip icon={<Gem className="w-3.5 h-3.5" />} value={balance?.gems ?? 0} title="Gems (from duplicates)" />
              <button
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  setMutedState(next);
                }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button onClick={onClose} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Daily claim + notices */}
          <div className="px-5 pt-4 space-y-3">
            {dailyReady && (
              <button
                onClick={handleClaimDaily}
                disabled={claiming}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold shadow-lg shadow-emerald-700/30 active:scale-[0.99] transition-all disabled:opacity-60"
              >
                <Zap className="w-4 h-4" />
                {claiming ? 'Claiming…' : 'Claim daily ✨ 150'}
              </button>
            )}
            {notice && (
              <div className="text-xs text-rose-300 bg-rose-950/60 border border-rose-800/60 rounded-lg px-3 py-2">{notice}</div>
            )}
          </div>

          {/* Chest catalog */}
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {chests.map((chest) => {
              const pity = profile?.chests.find((c) => c.id === chest.id);
              const affordableSpark = (balance?.sparkles ?? 0) >= chest.sparkleCost;
              const affordableGems = chest.gemCost != null && (balance?.gems ?? 0) >= chest.gemCost;
              return (
                <div
                  key={chest.id}
                  className={`relative rounded-2xl bg-gradient-to-b ${chest.accent} p-[1px] shadow-xl`}
                >
                  <div className="rounded-2xl bg-slate-900/85 p-4 h-full flex flex-col gap-3">
                    <div className="text-center">
                      <div className="text-5xl mb-1 select-none gacha-float">{chest.icon}</div>
                      <div className="font-black text-white">{chest.name}</div>
                      <div className="text-[11px] text-slate-400">
                        Guaranteed {chest.guaranteedFloor}+ every {chest.guaranteedInterval} · legendary ≤{' '}
                        {chest.hardPity} pulls
                      </div>
                    </div>

                    {/* Odds bars */}
                    <div className="space-y-1">
                      {chest.rates.map(({ rarity, percent }) => (
                        <div key={rarity} className="flex items-center gap-2 text-[10px]">
                          <span className={`w-16 ${RARITY_STYLES[rarity].text} font-semibold`}>
                            {RARITY_STYLES[rarity].label}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full bg-gradient-to-r ${RARITY_STYLES[rarity].card}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-slate-400 w-8 text-right">{percent}%</span>
                        </div>
                      ))}
                    </div>

                    {/* Pity tracker */}
                    {pity && (
                      <div className="text-[10px] text-slate-400 flex justify-between">
                        <span>Next {chest.guaranteedFloor}+ in: {pity.pullsUntilGuarantee + 1} pulls</span>
                        <span className={pity.pullsUntilHardPity <= 3 ? 'text-amber-300 font-bold animate-pulse' : ''}>
                          ✓ Legend in ≤ {pity.pullsUntilHardPity || chest.hardPity}
                        </span>
                      </div>
                    )}

                    <div className="mt-auto space-y-2">
                      <button
                        onClick={() => handleOpen(chest, 1)}
                        disabled={chest.sparkleCost > 0 ? !affordableSpark : !affordableGems}
                        className="w-full py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10 disabled:opacity-40 active:scale-95 transition-all"
                      >
                        Open ×1 — {chest.sparkleCost > 0 ? `✨ ${chest.sparkleCost}` : `💎 ${chest.gemCost}`}
                      </button>
                      <button
                        onClick={() => handleOpen(chest, 10)}
                        disabled={chest.sparkleCost > 0 ? !affordableSpark : !affordableGems}
                        className="w-full py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white disabled:opacity-40 active:scale-95 transition-all shadow-md"
                      >
                        Open ×10 — ✨ {chest.sparkleCost * 10} {chest.gemCost ? `/ 💎 ${chest.gemCost * 10}` : ''}
                        <span className="block text-[9px] font-medium opacity-80">fastest value · 1 guaranteed pity tick</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collection */}
          {profile?.player && Object.keys(profile.player.owned).length > 0 && (
            <div className="px-5 pb-5">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Your collection ({Object.keys(profile.player.owned).length})
              </h3>
              <div className="flex flex-wrap gap-2">
                <GachaCollection
                  owned={profile.player.owned}
                  equippedId={profile.player.equippedItemId}
                  onEquip={handleEquip}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unlock / reveal overlay */}
      {(phase === 'opening' || phase === 'reveal') && selectedChest && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {phase === 'opening' && (
            <div className="flex flex-col items-center gap-6">
              <div className="text-8xl gacha-shake select-none">{selectedChest.icon}</div>
              <p className="text-slate-300 text-sm animate-pulse">The chest is trembling…</p>
              <button
                onClick={() => setPhase('reveal')}
                className="text-xs text-slate-400 hover:text-white underline underline-offset-4"
              >
                Skip animation
              </button>
            </div>
          )}

          {phase === 'reveal' && currentDrop && (
            <RevealCard
              drop={currentDrop}
              index={revealIndex}
              startsAt={startedAt}
              ownedCount={profile?.player.owned[currentDrop.item.id] ?? 0}
            />
          )}

          {phase === 'reveal' && allDrops.length > 1 && (
            <div className="absolute bottom-8 text-xs text-slate-400">
              {revealIndex + 1} / {allDrops.length}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {phase === 'summary' && (
        <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6">
          <h2 className="text-xl font-black text-white text-center mb-1">Haul summary</h2>
          <p className="text-center text-xs text-slate-400 mb-5">
            {allDrops.length} items · top pull: {RARITY_STYLES[bestRarityOf(allDrops)].label}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {allDrops.map((drop, i) => {
              const style = RARITY_STYLES[drop.rarity];
              return (
                <button
                  key={i}
                  onClick={() => handleEquip(drop.item.id)}
                  className={`relative rounded-xl bg-gradient-to-b ${style.card} p-3 text-center ring-1 ${style.ring} shadow-lg ${style.glow} hover:scale-105 transition-transform`}
                >
                  {drop.duplicate ? (
                    <span className="absolute top-1 right-1 text-[9px] font-bold bg-orange-600 text-white rounded-full px-1.5 py-0.5">
                      💎 +{drop.gemsAwarded}
                    </span>
                  ) : (
                    <span className="absolute top-1 right-1 text-[9px] font-bold bg-emerald-500 text-white rounded-full px-1.5 py-0.5">
                      NEW
                    </span>
                  )}
                  <div className="text-3xl">{drop.item.icon}</div>
                  <div className="text-[11px] font-bold text-white truncate">{drop.item.name}</div>
                  <div className={`text-[9px] font-semibold ${style.text}`}>{style.label}</div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400 flex gap-3">
              <BalanceChip icon={<Sparkles className="w-3 h-3" />} value={profile?.player.sparkles ?? 0} title="Sparkles" />
              <BalanceChip icon={<Gem className="w-3 h-3" />} value={profile?.player.gems ?? 0} title="Gems" />
            </div>
            <div className="flex gap-2">
              {selectedChest && (
                <button
                  onClick={() => handleOpen(selectedChest, 10)}
                  className="py-2 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 text-white active:scale-95 transition-all"
                >
                  Again ×10
                </button>
              )}
              <button
                onClick={onClose}
                className="py-2 px-4 rounded-xl text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white active:scale-95 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- helpers & sub-components ---------------- */

function dropAt(index: number, opens: OpenResponse[]): Drop | null {
  let acc = 0;
  for (const open of opens) {
    for (const drop of open.drops) {
      if (acc === index) return drop;
      acc += 1;
    }
  }
  return null;
}

const BalanceChip: React.FC<{ icon: React.ReactNode; value: number; title: string }> = ({ icon, value, title }) => (
  <span
    title={title}
    className="flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2 py-1 rounded-full"
  >
    {icon}
    {value.toLocaleString()}
  </span>
);

/** One-by-one reveal card: burst + header glow + item pop, per rarity. */
const RevealCard: React.FC<{ drop: Drop; index: number; startsAt: number; ownedCount: number }> = ({
  drop,
  index,
  startsAt,
  ownedCount,
}) => {
  const style = RARITY_STYLES[drop.rarity];
  const isLegendary = drop.rarity === 'legendary';
  return (
    <div className="relative flex flex-col items-center">
      {isLegendary && (
        <div className="gacha-beam absolute w-[140vw] h-[140vw] pointer-events-none opacity-20" aria-hidden />
      )}
      <ParticleBurst rarity={drop.rarity} burstKey={`${startsAt}-${index}`} />
      <div
        key={index}
        className={`relative gacha-pop w-64 rounded-2xl bg-gradient-to-b ${style.card} ring-2 ${style.ring} shadow-2xl ${style.glow} p-8 text-center`}
      >
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-white/30" />
        <div className="text-6xl mb-2">{drop.item.icon}</div>
        <div className="font-black text-white text-lg">{drop.item.name}</div>
        <div className={`text-xs font-bold mt-1 ${style.text}`}>
          {style.label}
          {ownedCount > 1 && <span className="text-slate-400 font-normal"> · owned ×{ownedCount}</span>}
        </div>
        <p className="text-[11px] text-slate-300/80 mt-2 italic">{drop.item.blurb}</p>
        {drop.viaPity !== 'none' && (
          <div className="mt-2 text-[9px] uppercase tracking-widest text-slate-300/60">
            {drop.viaPity === 'hard-pity' ? 'pity fulfilled' : drop.viaPity.replace('-', ' ')} guaranteed
          </div>
        )}
        {drop.duplicate && (
          <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold bg-orange-900/70 border border-orange-500/40 text-orange-200 px-2 py-1 rounded-full">
            duplicate → 💎 +{drop.gemsAwarded}
          </div>
        )}
      </div>
    </div>
  );
};

/** Equip-able collection grid; receives data via props to stay pure. */
function GachaCollection({
  owned,
  equippedId,
  onEquip,
}: {
  owned: Record<string, number>;
  equippedId?: string;
  onEquip: (id: string) => void;
}) {
  return (
    <GachaCollectionInner owned={owned} equippedId={equippedId} onEquip={onEquip} />
  );
}
function GachaCollectionInner({
  owned,
  equippedId,
  onEquip,
}: {
  owned: Record<string, number>;
  equippedId?: string;
  onEquip: (id: string) => void;
}) {
  // Items are fetched once by the caller; owned counts key into them lazily.
  const [items, setItems] = useState<Map<string, import('./types.js').Item>>(new Map());
  React.useEffect(() => {
    fetch('/api/gacha/chests')
      .then((r) => r.json())
      .then((data: { items: import('./types.js').Item[] }) => {
        setItems(new Map(data.items.map((i) => [i.id, i])));
      })
      .catch(() => undefined);
  }, []);
  return (
    <>
      {Object.entries(owned).map(([id, count]) => {
        const item = items.get(id);
        if (!item) return null;
        const style = RARITY_STYLES[item.rarity];
        const equipped = equippedId === id;
        return (
          <button
            key={id}
            onClick={() => onEquip(id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 border ${
              equipped ? 'border-emerald-500/70 shadow-md shadow-emerald-500/20' : 'border-slate-700/60'
            } hover:border-indigo-500/50 transition-colors text-left`}
            title={equipped ? 'Equipped' : 'Click to equip'}
          >
            <span className="text-2xl">{item.icon}</span>
            <span>
              <span className={`block text-[11px] font-bold ${style.text}`}>{item.name}</span>
              <span className="block text-[9px] text-slate-500">{equipped ? 'Equipped ✓' : `×${count}`}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}
