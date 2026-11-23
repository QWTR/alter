// Trip planning: real flights, stays and a day-by-day plan, found on the web and shown as a trip card.

export const TRIP_FENCE = 'alter-trip';

const TRAVEL = /\b(lot(y|u|ów)?|samolot\w*|bilet\w* lotnicz\w*|wycieczk\w*|wakacj\w*|urlop\w*|podróż\w*|wyjazd\w*|city ?break|nocleg\w*|hotel\w*|airbnb|zwiedza\w*|flights?|trip|travel\w*|vacation|holiday|itinerar\w*|getaway|reise\w*|flug\w*|viaje\w*|vuelo\w*|voyage\w*|vol\b|vols\b|подорож\w*|переліт\w*)\b/i;
/** Does this message ask to plan a trip or find flights? */
export const wantsTravel = (msg: string) => TRAVEL.test(msg);

export const TRAVEL_GUIDE = `## Trip planner (use the web — real, current offers only)
Find the best options for the user's dates, budget and style with WebSearch/WebFetch: Google Flights (google.com/travel/flights?q=…), Skyscanner, Kiwi.com, Azair (cheap flexible flights from Poland/Europe), airline sites (Ryanair, Wizz Air, LOT, Lufthansa…), Booking.com/Airbnb/Hostelworld for stays. Compare at least 3 flight options (cheapest / best value / most comfortable), note baggage rules for low-cost airlines, total price for all travelers, transfer from the airport. If dates are flexible, check ±3 days and say which day is cheapest. Never invent prices: if you cannot verify one, give a range and say "~". Never book or pay — give links the user can open.
Answer with 1–2 sentences, then exactly one block:
\`\`\`${TRIP_FENCE}
{"title":"Lisbon, 4 nights","from":"Warsaw (WAW)","to":"Lisbon (LIS)","dates":"12–16 May 2026","travelers":2,"currency":"PLN","budget":4000,
"flights":[{"label":"Cheapest","airline":"Wizz Air","route":"WAW → LIS","out":"12 May 06:10 → 09:05","back":"16 May 21:40 → 02:30+1","stops":0,"duration":"4h 55m","price":1180,"bags":"cabin bag 40×30×20 only","link":"https://…"}],
"stays":[{"name":"…","area":"Alfama","price":980,"per":"total","rating":"9.1","why":"walkable, view","link":"https://…"}],
"days":[{"day":"Day 1 · Tue 12 May","title":"Alfama & sunset","items":["09:30 airport → Metro red line to Alameda (€1.85)","…"]}],
"total":3200,"tips":["Buy the Viva Viagem card","…"]}
\`\`\`
Keep "days" practical (times, transport, costs, 1 food spot per day). Use the user's language inside the JSON. After the block, one line: what you could not verify or what to decide.`;

export function tripsIn(text: string): unknown[] {
  const out: unknown[] = [];
  const re = new RegExp('```' + TRIP_FENCE + '\\s*\\n([\\s\\S]*?)```', 'g');
  for (const m of text.matchAll(re)) {
    try { out.push(JSON.parse(m[1])); } catch {}
  }
  return out;
}
