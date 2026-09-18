# ✈️ FLYNOW — book a flight, land on a beautiful confirmation

A self-contained, zero-dependency flight-booking demo in the visual language of
a premium Gulf carrier's booking flow (the reference screenshot): dark-slate
header, gold accents, white cards, and a persistent trip-summary rail — ending
on the classic **"Your booking is confirmed"** page with a booking reference,
extras upsells, and a collapsible payment summary.

> **FLYNOW is a fictional airline.** The reference screenshot showed a real
> carrier's confirmation page; this demo deliberately reproduces the
> *experience* — layout, flow, polish — under its own made-up brand.
> Flights, prices and booking references are generated locally in your
> browser. Nothing is purchased, reserved, or sent anywhere, and nothing it
> produces is a real travel document.

## The flow

1. **Search** — origin/destination (14 airports), dates, guests
   (adults + children), cabin. One-way or return.
2. **Departing / return flight** — three non-stop departures per day per
   route, each with fare cards (Economy Basic/Comfort/Deluxe, Business
   Basic/Deluxe, First Deluxe). Switch cabins per direction — fly out in
   First, come home in Business.
3. **Guests** — passenger names.
4. **Extras** — extra baggage, Meet & Assist, travel insurance, chauffeur
   (complimentary on First and Business Deluxe fares).
5. **Payment** — itemised fare + taxes + extras; simulated card form.
6. **Confirmation** — the reference-shot page: ✓ confirmed banner, booking
   reference, total, share/manage links, chauffeur banner, post-booking
   extras upsells, payment summary, and the summary rail showing flight
   details, guests, complimentary perks ("Included" chip), and assigned
   seats per direction.

## Staff portal

`admin.html` is the airline's back office, behind a demo login gate:

- **Sign in**: username `admin`, password `0000` (shown on the login screen —
  the check runs client-side in the browser; it's a demo gate, not security).
- **Dashboard**: KPI tiles (bookings, revenue, load factor, on-time rate),
  today's departure board for the Abu Dhabi hub — driven by the *same*
  seeded schedule generator as the booking site, so staff see the flights
  customers can book — plus a recent-bookings table and a booking-reference
  lookup. All figures are date-seeded demo data.
- Linked from the booking site's footer ("Staff portal ›"); sign-out and
  session persistence via `sessionStorage`.

## Nerdy bits

- **Deterministic schedules** — flights for a route + date are produced by a
  seeded FNV/xorshift RNG, so the same search always shows the same
  departures and prices.
- **Real geometry** — durations and fares derive from great-circle distance
  (haversine) between actual airport coordinates, and arrival times respect
  each airport's UTC offset (with "+1 day" badges when you cross midnight).
- **One state object** — the whole app is a `render()` over a single state,
  vanilla HTML/CSS/JS, no build step, no external requests.

## Run it

It's a static site — open `index.html` directly, or serve the folder:

```bash
cd flynow
python3 -m http.server 8000
# open http://localhost:8000
```

## Project layout

```
flynow/
├── index.html   # booking site shell: header, stepper, flow column + summary rail
├── styles.css   # the premium-carrier look (slate/gold/teal)
├── app.js       # data, seeded schedule generator, state, all rendering
├── admin.html   # staff portal: login gate + operations dashboard
├── admin.css    # portal styling (login card, stat tiles, tables)
└── admin.js     # demo auth (admin / 0000), date-seeded ops & bookings data
```
