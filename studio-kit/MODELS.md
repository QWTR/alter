# ALTTER Studio — 3D world reference (read this before writing a World scene)

Everything is imported from `'alter-kit'`. Units: 1 = one metre, y is up, the ground is y = 0.
Things face **+z** (towards the usual camera); `face={deg}` turns them. The camera normally sits at +z looking back:
`cam={{ pos: [3, 2.2, 7], look: [0, 1.2, 0] }}`.

Every model takes: `pos={[x, y, z]}` · `face={degrees}` · `scale` · `at={seconds}` (pops in) ·
`path={[[t, x, z], [t, x, z]]}` (moves along the ground; it turns to where it goes; people and animals walk, wheels turn).

A wrong `kind` never crashes: the renderer prints `WARN …` and uses a default. **Read every WARN line and fix it.**
If you import a name that does not exist, the renderer stops with `NOT IN THE KIT: …`.

## Rule 1 — the world must match the story
Use only what the script needs. A reel about coffee has a café, cups and people — **no cars**. Vehicles appear only
when the story is about one or the user asked. Never add a road, a car or a speedometer "for decoration".

## Rule 2 — nothing wrong on a model
- A normal car is `<Car kind="sedan|hatch|suv|sport|van|pickup" />`. It has **no** police lights and no siren, ever.
- Police = `<Car kind="police" />`, ambulance = `kind="ambulance"`, fire brigade = `kind="firetruck"`. Only these flash.
- Give each character and object its own look once (a `const`) and reuse it in every shot — same colours, hair, outfit, plate.
- Do not put a hat, a prop or an effect on something unless the script says so.

## Rule 3 — no model for it? Build it.
Never swap in "something similar" (a box for a washing machine, a car for a tractor). Build the thing from Parts:

```tsx
import { Model, Part } from 'alter-kit';
// built standing on y = 0, centred on x/z, front towards +z; sizes in metres
const WashingMachine = (p: any) => (
  <Model shadow={0.5} {...p}>
    <Part shape="round" size={[0.7, 0.9, 0.65]} pos={[0, 0.45, 0]} color="#f2f4f6" shine={0.6} />
    <Part shape="disc" size={[0.46, 0.05, 0.46]} pos={[0, 0.42, 0.33]} rot={[90, 0, 0]} color="#c9ccd1" metal={0.6} />
    <Part shape="disc" size={[0.36, 0.06, 0.36]} pos={[0, 0.42, 0.335]} rot={[90, 0, 0]} color="#27384d" shine={0.9} />
    <Part shape="box" size={[0.6, 0.1, 0.02]} pos={[0, 0.8, 0.33]} color="#d8dbe0" />
    <Part shape="ball" size={0.06} pos={[0.2, 0.8, 0.345]} color="#2d6bff" glow={1.5} />
  </Model>
);
// then: <WashingMachine pos={[1, 0, -2]} />
```
- `Part`: `shape` box | round (soft box) | ball | cyl | disc | cone | capsule | torus | dome | wedge (ramp) | prism (roof) ·
  `size` [w, h, d] or one number · `pos` · `rot` [x, y, z] **degrees** · `color` · `glow` 0–3 (lamps, screens) ·
  `opacity` · `shine` 0–1 · `metal` 0–1. cyl/disc/cone/capsule stand along y; lay them down with `rot={[90,0,0]}` or `[0,0,90]`.
- `Model`: `pos|path, face, scale, at` + `spin` (deg/s) · `bob` · `hop` · `sway` · `tilt` · `pulse` · `shadow` (radius).
- Use 8–25 parts: the main body, then the 3–6 details that make it recognisable (handles, buttons, wheels, a face, a label).
- After building, render one frame (`--at 0.5 --format jpg --draft`) and LOOK: is it recognisable, standing on the ground, the right size next to a person (1.9 m)?

## World
`<World sky cam|follow fov shake tint fog>` — `sky`: day | morning | sunset | dusk | night | overcast | snow | studio | indoor | space | [top, bottom].
`cam`: `{pos, look}` or keyframes `[{t, pos, look, fov?}]` — always move the camera a little. `follow={{ path, offset, look }}` = chase cam.
`shake` 0–0.15 only on a real impact. Real sun shadows are on by default.
Ground `{kind: grass|sand|snow|dirt|asphalt|concrete|wood|tiles|carpet|moon|stage, color}` · Road `{from, to, width, lanes, face, walk}` ·
Path `{from, to, width, face, color}` · Water `{pos, size [w,d], round}` · Clouds · Stars · SkyDisc `{moon}` · Rain · Snow.

## Scenery — a whole dressed place in one line (the middle is free for your characters)
`<Scenery kind="…" name="text on the sign" accent="#colour" night />`
- indoor (use `sky="indoor"`): kitchen · living · bedroom · office · bathroom · cafe · restaurant · shop · warehouse · classroom · gym · hospital
- outdoor: street (no cars) · park · garden · playground · beach · farm · forest · mountains · city · desert
- other: stage · space (`sky="space"`) · studio (a clean product podium)
Characters stand around `[0, 0, 0]` … `[0, 0, 2]`. Camera: `pos [2.5, 2.2, 7]`, `look [0, 1.2, -0.5]`; close-up: `pos [1, 1.9, 3.2]`, `look [0, 1.6, 0]`.
Add your own Items and Models next to it. Do not add a second Ground.

## Person
`<Person pos shirt pants skin hair … />`
- look: `skin, shirt, pants, hair, shoes` (colours) · `hairStyle` short | long | bob | bun | ponytail | curly | bald | mohawk ·
  `hat` none | cap | helmet | hardhat | beanie | tophat | chef | crown | cowboy | party | headphones + `hatColor` ·
  `outfit` tshirt | hoodie | suit | dress | apron | coat | vest | uniform | tank · `glasses` (true | "sun") · `beard` ·
  `age` adult | child | elder · `height`, `build` (1 = normal)
- face: `mood` flat | smile | laugh | sad | shout | angry | surprised | sleep | love · `talk` (true or [from, to] s) · `cry` · `nod` · `no`
- body: `pose` stand | sit | lie | cheer | point | think | phone | carry | shrug | facepalm | dance | hips · `wave` · `jump` · `run`
- hand: `hold` phone | cup | bottle | bag | briefcase | book | flowers | box | umbrella | mic | sign | balloon | pizza | money | laptop + `holdColor`, `holdText`
- sitting: put a Chair/Sofa at the same `pos` and give `pose="sit"`. Lying on a Bed: same pos, `pos y = 0.5`, `pose="lie"`.
`<Crowd pos size={[w, d]} count cheer look={[x, z]} />` — up to 40 different people.

## Animal
`<Animal kind pos … />` — dog · cat · cow · pig · sheep · horse · fox · bear · rabbit · mouse · elephant · lion · deer · zebra ·
chicken · duck · penguin · frog · owl · fish. Props: `color, color2, collar, happy, sit, sleep, jump, talk, scale`.
`<Bird pos|path fly color />` (pigeon; black = crow, green = parrot). `<Robot color accent mood wave talk />`.

## Item — 120 everyday objects at real size
`<Item kind="…" pos color color2 text scale spin bob hop />` (on a table: `pos y = 0.75`; on a Cabinet: 0.96)
phone laptop tablet · box crate gift bag suitcase backpack cart chest barrel · cup mug glass bottle can · book books newspaper letter ·
pizza burger fries hotdog cake donut apple banana carrot bread cheese egg icecream · coin coins money moneybag trophy medal crown diamond key lock ·
ball basketball dumbbell skateboard controller headphones dice cards chess teddy duck-toy rocket-toy · guitar drum trumpet piano mic megaphone bell ·
hammer wrench axe shovel ladder broom bucket vacuum paint pencil scissors calculator · pan pot plate candle · clock alarm bulb battery plug ·
umbrella camera flag balloon heart star bomb magnet target chart globe satellite · tooth pill syringe bandage thermometer ·
toilet-paper soap toothbrush · flower cactus-pot watering-can log mushroom fish-bowl birdhouse bone · mailbox cone tent campfire snowman pumpkin sword shield potion
A giant hero prop: `scale={6}`.

## Places and furniture
Nature: Tree `{kind: pine|round|palm|birch|dead|blossom|autumn|apple}` · Trees (rows) · Bush `{flowers}` · Flowers · Grass · Rock · Mountains
Buildings: House `{floors, wall, roof, lit}` · Block · Shop `{name, awning}` · Tower · Barn
Rooms: Room `{w, d, h, wall, floor: wood|tiles|carpet|concrete, window, door}` · Wall · Door `{open}` · Window `{night, curtains}` · Picture `{text}` · Rug
Street: StreetLamp `{on}` · Bench · Bin · TrafficLight `{state}` · Fence `{length, kind}` · BusStop · Fountain · Stage3D · Sign `{text, bg, fg}`
Furniture: Table `{size, h, round}` · Chair `{kind: wood|office|stool|armchair}` · Sofa · Bed · Desk · Shelf · FloorLamp · Tv `{text}` ·
Screen `{text}` (whiteboard) · Fridge `{open}` · Plant `{kind}` · Cabinet (kitchen / shop counter) · Stove `{on}` · Sink · Bath · Toilet · Wardrobe · Prop (plain box)

## Vehicles (only when the story needs one)
Car `{kind: sedan|hatch|sport|suv|van|pickup|taxi|police|ambulance|firetruck|bus|truck, color, plate, text, driver, brake, lights, smoke, cargo}` ·
Bike `{rider}` · Boat `{kind: sail|motor|row}` · Plane · Helicopter · Rocket `{launch}` · Ufo `{beam}` · Train `{cars}` · AirBalloon

## Effects (small, only when the story calls for them)
Flame · Puffs (smoke / steam) · Sparkles · Hearts · Bubbles · Rain · Snow

## Overlays (flat, on top of the World; px on a 1080 × 1920 frame; `at` / `out` seconds)
Tag `{text, x, y}` name tag · Badge `{text, icon, mark}` · Say `{text, x, y, think}` speech / thought bubble ·
Gauge `{label, from, to, prefix, suffix, max, bad, good, icon}` a counter for ANY number (money, likes, stress, battery) ·
Notify `{title, text, reply}` phone message · Shout `{text, sub}` · Stamp `{text}` · Emoji `{icon, x, y}` · Arrow `{x, y, dir, text}` ·
Rating `{value, of, label}` · Timer `{from, to}` · Speedo (only for scenes about speed)

## A complete non-car example (two shots)
```tsx
import { Timeline, Scene, World, Scenery, Person, Animal, Item, Tag, Say, Gauge, Captions, Music } from 'alter-kit';
export const meta = { format: 'reel', seconds: 7, theme: 'midnight' };
const ola = { skin: '#f3cda8', shirt: '#e84393', pants: '#2c3e66', hair: '#5a3b22', hairStyle: 'ponytail' } as const; // same in every shot
export default () => (<>
  <Timeline overlap={0}>
    <Scene dur={3.5} enter="none" exit="none">
      <World sky="indoor" cam={[{ t: 0, pos: [3, 2.3, 7], look: [0, 1.2, -0.5] }, { t: 3.5, pos: [1.6, 2, 5], look: [0, 1.3, -0.5] }]}>
        <Scenery kind="kitchen" />
        <Person {...ola} pos={[-0.6, 0, 0.4]} mood="surprised" pose="point" face={20} />
        <Animal kind="cat" pos={[0.9, 0.96, -3.1]} face={-20} sit />
        <Item kind="cake" pos={[0.3, 0.96, -3.1]} />
      </World>
      <Tag text="Ola, 29" x={360} y={520} />
      <Say text="To był mój tort!" x={420} y={700} at={1.2} />
    </Scene>
    <Scene dur={3.5} enter="none" exit="none">
      <World sky="indoor" cam={[{ t: 0, pos: [1.2, 1.5, -0.6], look: [0.9, 1.2, -3.1] }, { t: 3.5, pos: [1.0, 1.4, -1.2], look: [0.9, 1.15, -3.1] }]}>
        <Scenery kind="kitchen" />
        <Animal kind="cat" pos={[0.9, 0.96, -3.1]} face={10} happy />
      </World>
      <Gauge label="Wyrzuty sumienia" icon="😼" to={0} from={3} max={100} y={1450} />
    </Scene>
  </Timeline>
</>);
```
