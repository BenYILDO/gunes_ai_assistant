import './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, feed, missedWeekdays, moodOf, newPet, streakAlive, view } from '../src/pet.js';
import { getPet, feedPet, renamePet, setPetEnabled, earnPet, visitPet, buyPetItem, bumpPet } from '../src/pet.js';

// 2026-11-09 Pazartesi
const fed = (lastFed: string | null, streak = 1) => ({ ...newPet(), lastFed, streak, bestStreak: streak, totalFeeds: streak });

test('ilk besleme: seri 1, aynı gün tekrar beslemek bir şey değiştirmez', () => {
  const a = feed(newPet(), '2026-11-09');
  assert.equal(a.fed, true);
  assert.equal(a.state.streak, 1);
  const b = feed(a.state, '2026-11-09');
  assert.equal(b.fed, false);
  assert.equal(b.state.totalFeeds, 1);
});
test('ertesi gün besleyince seri artar', () => {
  const r = feed(fed('2026-11-09', 2), '2026-11-10');
  assert.equal(r.state.streak, 3);
  assert.equal(r.state.bestStreak, 3);
});
test('hafta sonu seriyi bozmaz (Cuma → Pazartesi)', () => {
  assert.equal(missedWeekdays('2026-11-06', '2026-11-09'), 0);
  assert.equal(feed(fed('2026-11-06', 4), '2026-11-09').state.streak, 5);
});
test('hafta içi bir gün atlanınca seri 1\'den başlar, en iyi seri korunur', () => {
  assert.equal(missedWeekdays('2026-11-09', '2026-11-11'), 1);
  const r = feed(fed('2026-11-09', 6), '2026-11-11');
  assert.equal(r.state.streak, 1);
  assert.equal(r.state.bestStreak, 6);
});
test('ruh hali: beslenmiş mutlu, seri sürüyorsa idare eder, atlanmışsa aç', () => {
  assert.equal(moodOf(fed('2026-11-10'), '2026-11-10'), 'happy');
  assert.equal(moodOf(fed('2026-11-09'), '2026-11-10'), 'content');
  assert.equal(moodOf(fed('2026-11-06'), '2026-11-09'), 'content');
  assert.equal(moodOf(fed('2026-11-04'), '2026-11-09'), 'hungry');
  assert.equal(moodOf(newPet(), '2026-11-09'), 'hungry');
});
test('görünümde koparılmış seri 0 görünür; ölüm/ceza yok', () => {
  assert.equal(streakAlive(fed('2026-11-04', 9), '2026-11-09'), false);
  assert.equal(view(fed('2026-11-04', 9), '2026-11-09').streak, 0);
});
test('ad temizleme', () => {
  assert.equal(cleanName('  Pamuk   Bey  '), 'Pamuk Bey');
  assert.equal(cleanName(''), '');
  assert.equal(cleanName(5), '');
  assert.equal(cleanName('x'.repeat(50)).length, 20);
});
test('varsayılan KAPALI: kapalıyken besleme, ziyaret, puan, sayaç ve mağaza çalışmaz', async () => {
  const a = await getPet();
  assert.equal(a.enabled, false);
  const f = await feedPet();
  assert.equal(f.fed, false);
  assert.equal(f.coins, 0);
  assert.equal((await visitPet()).gained, 0);
  await earnPet('card_done', { high: true });
  assert.equal((await getPet()).coins, 0);
  assert.equal((await bumpPet('pats', 5)).stats.pats, 0);
  const shop = await buyPetItem('ball');
  assert.ok('error' in shop && /kapalı/i.test(shop.error));
});

test('depo: besle, tekrar besleme, yeniden adlandır', async () => {
  assert.equal((await setPetEnabled(true)).enabled, true);
  const a = await getPet();
  assert.equal(a.fedToday, false);
  const f = await feedPet();
  assert.equal(f.fed, true);
  assert.equal(f.fedToday, true);
  assert.equal((await feedPet()).fed, false);
  assert.equal((await renamePet('Pamuk')).name, 'Pamuk');
  assert.equal((await renamePet('   ')).name, 'Pamuk');
  assert.equal((await getPet()).streak, 1);
});

import { ACHIEVEMENTS, ITEMS, WORK_CAP, bump, buyItem, chooseSpecies, earn, equipItem, levelOf, normalize, placeItem, unplaceItem, unlockAchievements, visit } from '../src/pet.js';

const T = '2026-11-10'; // Salı

test('yeni kayıtta mama kabı sahip ve yerleşik; eski kayıt yeni alanlarla tamamlanır', () => {
  const s = newPet();
  assert.deepEqual(s.owned, ['bowl']);
  assert.equal(s.placed[0]?.itemId, 'bowl');
  const old = normalize({ name: 'Pamuk', lastFed: '2026-11-09', streak: 4, bestStreak: 4, totalFeeds: 4 });
  assert.equal(old.name, 'Pamuk');
  assert.equal(old.coins, 0);
  assert.ok(old.owned.includes('bowl'));
  assert.ok(old.placed.some((p) => p.itemId === 'bowl'));
});

test('kart kapatınca puan; yüksek öncelik +2; günlük iş üst sınırı aşılmaz', () => {
  let s = newPet();
  const a = earn(s, 'card_done', T);
  assert.equal(a.gained >= 3, true);
  const hi = earn(newPet(), 'card_done', T, { high: true });
  assert.ok(hi.gained >= a.gained + 2 - 3); // yüksek öncelikte daha fazla (başarım bonusu hariç ilk kart aynı)
  s = newPet();
  let total = 0;
  for (let i = 0; i < 40; i++) {
    const r = earn(s, 'card_done', T, { high: true });
    s = r.state;
    total += r.gained;
  }
  assert.equal(s.work.amount, WORK_CAP); // iş puanı sınırda durur
  assert.ok(s.stats.cardsClosed === 40); // sayaç yine de artar
  assert.ok(total >= WORK_CAP); // başarım ödülleri sınırın dışındadır
});

test('ertesi gün iş puanı hakkı yenilenir', () => {
  let s = newPet();
  for (let i = 0; i < 20; i++) s = earn(s, 'card_done', T, { high: true }).state;
  assert.equal(s.work.amount, WORK_CAP);
  const next = earn(s, 'card_done', '2026-11-11', { high: true });
  assert.equal(next.state.work.date, '2026-11-11');
  assert.ok(next.state.work.amount > 0);
});

test('besleme puan verir ve ilk mama rozetini açar', () => {
  const r = feed(newPet(), T);
  assert.equal(r.fed, true);
  assert.ok(r.gained >= 5);
  assert.ok(r.newly.includes('first_feed'));
  assert.equal(r.state.achievements.first_feed, T);
  const again = feed(r.state, T);
  assert.equal(again.gained, 0);
});

test('günlük ziyaret: günün ilkinde puan, tekrar yok; seri hafta sonunu atlar', () => {
  const a = visit(newPet(), '2026-11-06'); // Cuma
  assert.equal(a.first, true);
  assert.ok(a.gained >= 2);
  assert.equal(visit(a.state, '2026-11-06').first, false);
  const mon = visit(a.state, '2026-11-09'); // Pazartesi: hafta sonu atlandı, seri sürer
  assert.equal(mon.state.visitStreak, 2);
  const gap = visit(mon.state, '2026-11-12'); // Salı atlandı
  assert.equal(gap.state.visitStreak, 1);
  assert.equal(gap.state.bestVisitStreak, 2);
});

test('mağaza: puan yetmezse alınmaz, yeterse düşer; aynı eşya iki kez alınmaz', () => {
  const s = { ...newPet(), coins: 25 };
  const no = buyItem(s, 'house', T);
  assert.equal(no.ok, false);
  const yes = buyItem(s, 'ball', T);
  assert.equal(yes.ok, true);
  if (yes.ok) {
    assert.equal(yes.state.coins, 5);
    assert.ok(yes.state.owned.includes('ball'));
    assert.equal(buyItem(yes.state, 'ball', T).ok, false);
  }
  assert.equal(buyItem(s, 'yok', T).ok, false);
});

test('yerleştirme: yalnızca sahip olunan yerleştirilebilir eşya; oranlar 0-1 arasına kırpılır; mama kabı kaldırılamaz', () => {
  let s: ReturnType<typeof newPet> = { ...newPet(), coins: 200 };
  const b = buyItem(s, 'house', T);
  assert.ok(b.ok);
  if (!b.ok) return;
  s = b.state;
  const p = placeItem(s, 'house', 1.7, -3);
  assert.ok(p.ok);
  if (!p.ok) return;
  const h = p.state.placed.find((x) => x.itemId === 'house')!;
  assert.deepEqual([h.x, h.b], [1, 0]);
  assert.equal(placeItem(s, 'ball', 0.5, 0.1).ok, false); // sahip değil
  assert.equal(placeItem(s, 'hat', 0.5, 0.1).ok, false); // takılır, yerleştirilmez
  // yeniden yerleştirme taşır, çoğaltmaz
  const q = placeItem(p.state, 'house', 0.3, 0.1);
  assert.ok(q.ok && q.state.placed.filter((x) => x.itemId === 'house').length === 1);
  assert.equal(unplaceItem(p.state, 'bowl').ok, false);
  const un = unplaceItem(p.state, 'house');
  assert.ok(un.ok && !un.state.placed.some((x) => x.itemId === 'house') && un.state.owned.includes('house'));
});

test('takma: yalnızca sahip olunan takılabilir eşya', () => {
  const s = { ...newPet(), coins: 100 };
  const b = buyItem(s, 'hat', T);
  assert.ok(b.ok);
  if (!b.ok) return;
  assert.equal(equipItem(s, 'hat', true).ok, false);
  const e = equipItem(b.state, 'hat', true);
  assert.ok(e.ok && e.state.worn.includes('hat'));
  assert.equal(equipItem(b.state, 'house', true).ok, false);
  if (e.ok) assert.deepEqual(equipItem(e.state, 'hat', false).ok && (equipItem(e.state, 'hat', false) as { state: { worn: string[] } }).state.worn, []);
});

test('tür: tilki satın alınır, sonra serbestçe seçilir; yetersiz puan reddedilir', () => {
  const poor = newPet();
  assert.equal(chooseSpecies(poor, 'fox', T, true).ok, false);
  assert.equal(chooseSpecies(poor, 'fox', T, false).ok, false);
  const rich = { ...newPet(), coins: 200 };
  const bought = chooseSpecies(rich, 'fox', T, true);
  assert.ok(bought.ok);
  if (!bought.ok) return;
  assert.equal(bought.state.species, 'fox');
  assert.ok(bought.state.achievements.fox);
  const back = chooseSpecies(bought.state, 'cat', T);
  assert.ok(back.ok && back.state.species === 'cat');
  assert.equal(chooseSpecies(rich, 'ejderha', T, true).ok, false);
});

test('rozetler: sayaçlar eşiğe varınca açılır, ödül verir, bir kez açılır; seviye yükselir', () => {
  let s = newPet();
  s = { ...s, stats: { ...s.stats, cardsClosed: 10 } };
  const u = unlockAchievements(s, T);
  assert.ok(u.newly.includes('cards_1') && u.newly.includes('cards_10'));
  const total = ACHIEVEMENTS.filter((a) => u.newly.includes(a.id)).reduce((t, a) => t + a.reward, 0);
  assert.equal(u.state.coins, total);
  assert.equal(unlockAchievements(u.state, T).newly.length, 0);
  assert.equal(levelOf(0).level, 1);
  assert.ok(levelOf(500).level >= 6);
  assert.equal(levelOf(100000).next, null);
});

test('sevme/oyun sayaçları sınırlı artar ve rozet açabilir', () => {
  const r = bump(newPet(), 'pats', 500, T);
  assert.equal(r.state.stats.pats, 50); // tek seferde en çok 50
  const many = bump({ ...newPet(), stats: { ...newPet().stats, pats: 95 } }, 'pats', 10, T);
  assert.ok(many.newly.includes('pats_100'));
  assert.equal(ITEMS.filter((i) => i.price === 0).length, 1); // yalnızca mama kabı ücretsiz
});

test('açılınca kart kapatma puan verir; kapatınca durur, veriler silinmez', async () => {
  await setPetEnabled(true);
  const before = (await getPet()).coins;
  await earnPet('card_done');
  const mid = (await getPet()).coins;
  assert.ok(mid > before);
  await setPetEnabled(false);
  await earnPet('card_done');
  assert.equal((await getPet()).coins, mid); // kapalıyken kazanılmaz
  assert.equal((await setPetEnabled(true)).coins, mid); // veriler korunur
});

import { MAX_FREEZES } from '../src/pet.js';
test('seri koruyucu: iş günü kaçırmayı karşılar, hafta sonu zaten sayılmaz', () => {
  // Pazartesi 2026-11-09 beslendi (seri 4); Salı ve Çarşamba atlandı, Perşembe 2026-11-12 besleniyor: 2 iş günü kaçtı
  const base = { ...newPet(), lastFed: '2026-11-09', streak: 4, bestStreak: 4, totalFeeds: 4 };
  assert.equal(streakAlive(base, '2026-11-12'), false); // koruyucu yok: seri kopar
  assert.equal(feed(base, '2026-11-12').state.streak, 1);
  const one = { ...base, freezes: 1 };
  assert.equal(streakAlive(one, '2026-11-12'), false); // 2 gün kaçtı, 1 koruyucu yetmez
  const two = { ...base, freezes: 2 };
  assert.equal(streakAlive(two, '2026-11-12'), true);
  const r = feed(two, '2026-11-12');
  assert.equal(r.state.streak, 5); // seri devam eder
  assert.equal(r.state.freezes, 0); // iki koruyucu harcandı
  // hafta sonu kaçırmak koruyucu harcamaz
  const fri = { ...newPet(), lastFed: '2026-11-06', streak: 2, bestStreak: 2, freezes: 1 };
  const mon = feed(fri, '2026-11-09');
  assert.equal(mon.state.streak, 3);
  assert.equal(mon.state.freezes, 1);
});

test('seri koruyucu satın alma: puan ve üst sınır; envantere (owned) girmez', () => {
  let s = { ...newPet(), coins: 200 };
  for (let i = 0; i < MAX_FREEZES; i++) {
    const r = buyItem(s, 'freeze', T);
    assert.ok(r.ok);
    if (r.ok) s = r.state;
  }
  assert.equal(s.freezes, MAX_FREEZES);
  assert.equal(s.coins, 200 - 25 * MAX_FREEZES);
  assert.equal(buyItem(s, 'freeze', T).ok, false); // üst sınır
  assert.equal(s.owned.includes('freeze' as never), false);
  assert.equal(buyItem({ ...newPet(), coins: 10 }, 'freeze', T).ok, false); // puan yetmez
  assert.equal(normalize({ owned: ['bowl', 'freeze' as never], freezes: 9 }).freezes, MAX_FREEZES);
  assert.equal(placeItem(s, 'freeze', 0.5, 0.1).ok, false); // yerleştirilemez
});

import { DAILY_GOALS } from '../src/pet.js';
test('günlük görevler: 3 kart kapatınca bir kez ek puan; ertesi gün yenilenir; iş puanı sınırına sayılmaz', () => {
  let s = newPet();
  const day = '2026-11-10';
  let log: number[] = [];
  for (let i = 0; i < 3; i++) {
    const r = earn(s, 'card_done', day);
    s = r.state;
    log.push(r.gained);
  }
  const g = DAILY_GOALS.find((x) => x.id === 'cards3')!;
  assert.ok(log[2]! >= 3 + g.reward); // üçüncü kartta görev ödülü de gelir
  assert.deepEqual(s.daily.claimed.includes('cards3'), true);
  const again = earn(s, 'card_done', day);
  assert.equal(again.state.daily.claimed.filter((c) => c === 'cards3').length, 1); // ödül tekrar verilmez
  const next = earn(again.state, 'card_done', '2026-11-11');
  assert.equal(next.state.daily.date, '2026-11-11');
  assert.equal(next.state.daily.cards, 1);
  assert.equal(next.state.daily.claimed.length, 0);
  assert.ok(s.work.amount <= WORK_CAP);
});
test('günlük görev: öneri uygulama ya da toplantı işleme "1 iş" görevini tamamlar; görünüm ilerlemeyi gösterir', () => {
  const r = earn(newPet(), 'proposal', '2026-11-10');
  assert.ok(r.state.daily.claimed.includes('action1'));
  const v = view(r.state, '2026-11-10');
  const a = v.goals.find((x) => x.id === 'action1')!;
  assert.equal(a.done, true);
  assert.equal(a.have, 1);
  assert.equal(v.goals.find((x) => x.id === 'cards3')!.have, 0);
  // başka bir günün görünümü sıfırdır
  assert.equal(view(r.state, '2026-11-12').goals.every((x) => !x.done && x.have === 0), true);
});
