// Compare the exact ratios; rounded display scores must never decide qualification.
export function compareAverage(a, b) {
  if (!a.votes || !b.votes) return (b.votes > 0) - (a.votes > 0);
  return b.total * a.votes - a.total * b.votes;
}
export function qualificationPlan(rows, places) {
  if (![10, 15].includes(places)) throw new Error('Choose 10 or 15 finalists.');
  const ranked = rows.filter(row => row.votes > 0).sort((a,b)=>compareAverage(a,b)||a.number-b.number);
  if (ranked.length < places) throw new Error(`At least ${places} scored auditions are needed.`);
  const cutoff = ranked[places-1];
  const above = ranked.filter(row => compareAverage(row,cutoff)<0);
  const tied = ranked.filter(row => compareAverage(row,cutoff)===0);
  const slots = places-above.length;
  return { places, above, tied, slots, needsBallot: tied.length>slots };
}
