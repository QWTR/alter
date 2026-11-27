// Ready-made places: <Scenery kind="kitchen" /> drops a whole dressed location into the World, with the middle left
// free for the characters (they stand around [0, 0, 0]…[0, 0, 2], facing +z = towards the camera).
// The camera looks from +z: e.g. pos [3, 2.2, 7], look [0, 1.2, 0]. Indoor sets want <World sky="indoor">.
import React from 'react';
import { P, pick, type V3 } from './core3d';
import { Clouds, Ground, Path, Road, SkyDisc, Stars, Water } from './world';
import { Barn, Bath, Bed, Bench, Bin, Block, Bush, Chair, Cabinet, Desk, Fence, FloorLamp, Flowers, Fountain, Fridge, Grass, House, Mountains, Picture, Plant, Rock, Room, Rug, Screen, Shelf, Shop, Sink, Sofa, Stage3D, Stove, StreetLamp, Table, Toilet, Tower, Tree, Trees, Tv, Wardrobe, Window } from './places';
import { Item, Sign } from './things';

export const SCENERIES = ['kitchen', 'living', 'bedroom', 'office', 'bathroom', 'cafe', 'shop', 'classroom', 'gym', 'street', 'park', 'garden', 'beach', 'farm', 'forest', 'mountains', 'city', 'stage', 'space', 'desert', 'studio', 'playground', 'hospital', 'restaurant', 'warehouse'] as const;
export type SetKind = (typeof SCENERIES)[number];

const Podium: React.FC<{ color: string }> = ({ color }) => <><P shape="disc" size={[3.2, 0.2, 3.2]} pos={[0, 0.1, 0]} color={color} /><P shape="disc" size={[2.6, 0.12, 2.6]} pos={[0, 0.26, 0]} color="#ffffff" /></>;

/**
 * A whole location. `kind`: kitchen | living | bedroom | office | bathroom | cafe | shop | classroom | gym | hospital |
 * restaurant | warehouse (indoor — use sky="indoor") · street | park | garden | playground | beach | farm | forest |
 * mountains | city | desert (outdoor) · stage | space | studio.
 * `name` is written on the shop / café sign or the board. `wall` / `accent` recolour it. Add your own things next to it.
 */
export const Scenery: React.FC<{ kind: SetKind | string; name?: string; wall?: string; accent?: string; night?: boolean }> = ({ kind: kd, name, wall, accent, night }) => {
  const kind = pick("Scenery", kd, SCENERIES, 'park');
  const a = accent ?? '#d8342c';
  switch (kind) {
    case 'kitchen': return (
      <>
        <Room w={9} d={7} wall={wall ?? '#f1e6d2'} floor="tiles" window={false} />
        <Cabinet pos={[-2.9, 0, -3.1]} w={2.2} /><Sink pos={[-1.3, 0, -3.15]} /><Stove pos={[-0.5, 0, -3.15]} on /><Cabinet pos={[0.85, 0, -3.1]} w={1.9} /><Fridge pos={[2.4, 0, -3.1]} />
        {[-3.0, -1.2, 0.6].map((x) => <P key={x} shape="box" size={[1.6, 0.7, 0.35]} pos={[x, 2.3, -3.3]} color={shade2(wall ?? '#f1e6d2')} />)}
        <Window pos={[3.6, 1.9, -3.48]} w={1.2} night={night} />
        <Item kind="pot" pos={[0.6, 0.96, -3.1]} /><Item kind="bread" pos={[1.2, 0.96, -3.05]} /><Item kind="mug" pos={[-3.2, 0.96, -3.05]} color={a} /><Item kind="apple" pos={[-2.6, 0.96, -3.0]} /><Item kind="bottle" pos={[-2.3, 0.96, -3.2]} />
        <Table pos={[2.9, 0, 0.4]} size={[1.3, 0.9]} /><Chair pos={[2.9, 0, 1.2]} face={180} /><Chair pos={[2.9, 0, -0.4]} />
        <Item kind="plate" pos={[2.9, 0.75, 0.5]} /><Plant pos={[-3.9, 0, -0.5]} /><Item kind="clock" pos={[1.9, 2.2, -3.44]} />
      </>
    );
    case 'living': return (
      <>
        <Room w={9} d={7} wall={wall ?? '#e9dfd0'} floor="wood" window={false} />
        <Sofa pos={[0, 0, -2.7]} w={2.6} color={accent ?? '#5b7a99'} /><Rug pos={[0, 0, -0.6]} size={[3.6, 2.4]} color="#b5524a" />
        <Table pos={[0, 0, -1.3]} size={[1.2, 0.6]} h={0.42} /><Item kind="mug" pos={[-0.3, 0.42, -1.3]} /><Item kind="books" pos={[0.3, 0.42, -1.3]} />
        <FloorLamp pos={[-2.1, 0, -2.9]} /><Plant pos={[2.2, 0, -2.9]} kind="palm" /><Shelf pos={[-3.6, 0, -3.2]} />
        <Tv pos={[3.9, 0, -0.5]} face={-90} /><Window pos={[2.6, 1.9, -3.48]} night={night} curtains="#d9c9a8" /><Picture pos={[0, 2.2, -3.44]} w={1.4} h={0.9} />
      </>
    );
    case 'bedroom': return (
      <>
        <Room w={8} d={6.5} wall={wall ?? '#dfe6ee'} floor="carpet" window={false} />
        <Bed pos={[-1.6, 0, -2.1]} color={accent ?? '#7fa8c9'} /><Table pos={[-0.3, 0, -2.9]} size={[0.5, 0.45]} h={0.5} /><Item kind="alarm" pos={[-0.3, 0.5, -2.9]} />
        <Wardrobe pos={[2.6, 0, -2.9]} /><Rug pos={[0.4, 0, 0]} round size={[2.4, 2.4]} color="#e9d9b5" /><Window pos={[0.9, 1.9, -3.23]} night={night} curtains="#c9b8d9" />
        <Desk pos={[-3.3, 0, 0.6]} face={90} w={1.3} /><Chair pos={[-2.6, 0, 0.6]} face={-90} kind="office" /><Item kind="laptop" pos={[-3.3, 0.75, 0.6]} face={90} /><Plant pos={[3.4, 0, -0.4]} />
        <Picture pos={[-1.6, 2.1, -3.2]} />
      </>
    );
    case 'office': return (
      <>
        <Room w={10} d={7.5} wall={wall ?? '#e6e9ee'} floor="concrete" window={false} />
        {[-2.9, 2.9].map((x) => <React.Fragment key={x}><Desk pos={[x, 0, -2.4]} /><Chair pos={[x, 0, -1.7]} face={180} kind="office" /><Item kind="laptop" pos={[x - 0.2, 0.75, -2.4]} /><Item kind="mug" pos={[x + 0.5, 0.75, -2.3]} color={a} /></React.Fragment>)}
        <Screen pos={[0, 0, -3.6]} text={name ?? 'PLAN'} /><Shelf pos={[-4.4, 0, -0.6]} face={90} /><Plant pos={[4.3, 0, -3.2]} kind="palm" /><Plant pos={[-4.3, 0, -3.2]} />
        <Window pos={[-2.9, 2.0, -3.73]} w={1.4} night={night} /><Window pos={[2.9, 2.0, -3.73]} w={1.4} night={night} /><Item kind="clock" pos={[0, 2.9, -3.7]} />
        <Bin pos={[4.3, 0, -0.4]} color="#5d6066" scale={0.6} /><Item kind="chart" pos={[4.2, 0, 1.4]} face={-60} />
      </>
    );
    case 'bathroom': return (
      <>
        <Room w={6.5} d={5.5} wall={wall ?? '#d6ecef'} floor="tiles" window={false} />
        <Bath pos={[-2.2, 0, -1.6]} /><Sink pos={[0.6, 0, -2.4]} /><Toilet pos={[2.3, 0, -2.3]} />
        <P shape="box" size={[0.9, 1.0, 0.04]} pos={[0.6, 1.9, -2.72]} color="#bfe1f5" shine={1} /><Rug pos={[0.6, 0, -1.4]} size={[1.2, 0.7]} color="#7fb8d8" />
        <Item kind="toilet-paper" pos={[2.9, 0.9, -2.6]} /><Item kind="soap" pos={[0.9, 0.96, -2.3]} /><Item kind="duck-toy" pos={[-2.2, 0.6, -1.3]} /><Window pos={[-2.2, 2.2, -2.73]} w={1.0} h={0.8} night={night} />
      </>
    );
    case 'cafe': case 'restaurant': return (
      <>
        <Room w={11} d={8} wall={wall ?? (kind === 'cafe' ? '#efe2cf' : '#e9d7cf')} floor="wood" window={false} />
        <Cabinet pos={[0, 0, -3.3]} w={4} color="#7a5234" top="#e9e4da" /><Shelf pos={[-3.9, 0, -3.7]} w={2} books={false} /><Shelf pos={[3.9, 0, -3.7]} w={2} books={false} />
        <Sign pos={[0, 2.5, -3.9]} text={name ?? (kind === 'cafe' ? 'KAWIARNIA' : 'RESTAURACJA')} bg="#22252b" fg="#ffffff" w={3.6} h={0.7} pole={0} />
        <Item kind="cup" pos={[-1.2, 0.96, -3.3]} /><Item kind="cake" pos={[0.9, 0.96, -3.3]} scale={0.8} /><Item kind="donut" pos={[1.6, 0.96, -3.2]} /><Item kind="bottle" pos={[-3.6, 1.1, -3.7]} /><Item kind="bottle" pos={[-4.1, 1.1, -3.7]} color="#8a3a1a" /><Item kind="mug" pos={[3.7, 1.1, -3.7]} /><Item kind="mug" pos={[4.2, 1.1, -3.7]} color={a} />
        {[[-3.6, 0.6], [3.6, 0.6], [-3.6, 2.8], [3.6, 2.8]].map(([x, z], i) => <React.Fragment key={i}><Table pos={[x, 0, z]} size={[1.0, 1.0]} round /><Chair pos={[x - 0.85, 0, z]} face={90} /><Chair pos={[x + 0.85, 0, z]} face={-90} />{kind === 'restaurant' ? <Item kind="candle" pos={[x, 0.75, z]} /> : <Item kind="flower" pos={[x, 0.75, z]} scale={0.6} />}</React.Fragment>)}
        <Plant pos={[-5, 0, -3.4]} kind="palm" /><Window pos={[-5.3, 1.9, 0.8]} face={90} w={2.2} night={night} /><FloorLamp pos={[5, 0, -3.4]} />
      </>
    );
    case 'shop': case 'warehouse': return (
      <>
        <Room w={12} d={9} h={kind === 'warehouse' ? 5 : 3.6} wall={wall ?? (kind === 'warehouse' ? '#c9ccd1' : '#f1f1ee')} floor={kind === 'warehouse' ? 'concrete' : 'tiles'} window={false} />
        {[-5.3, 5.3].map((x) => [-2.6, 0, 2.6].map((z) => <Shelf key={`${x}${z}`} pos={[x, 0, z]} face={x < 0 ? 90 : -90} w={2.3} h={kind === 'warehouse' ? 3.4 : 2.1} books={false} />))}
        {[-5.3, 5.3].map((x) => [-2.6, 0, 2.6].map((z) => [0.5, 1.02, 1.55].map((y, j) => [-0.7, 0, 0.7].map((o) => <Item key={`${x}${z}${y}${o}`} kind={kind === 'warehouse' ? 'box' : (['can', 'bottle', 'box', 'bread', 'apple', 'toilet-paper'] as const)[Math.abs(Math.round(x + z * 3 + j * 2 + o * 3)) % 6]} pos={[x, y, z + o]} scale={kind === 'warehouse' ? 0.7 : 1} shadow={0} />))))}
        {kind === 'shop' ? <><Cabinet pos={[0, 0, -3.6]} w={3} top="#3a3d44" /><Item kind="calculator" pos={[0.6, 0.96, -3.6]} /><Sign pos={[0, 2.6, -4.4]} text={name ?? 'SKLEP'} bg={a} fg="#ffffff" w={4} h={0.7} pole={0} /><Item kind="cart" pos={[3, 0, 1.6]} face={-30} /></>
          : <>{[[-1.5, -3.2], [0, -3.2], [1.5, -3.2], [-0.7, -3.2], [0.8, -3.2]].map(([x, z], i) => <Item key={i} kind="crate" pos={[x, i > 2 ? 0.7 : 0, z]} />)}<Item kind="ladder" pos={[3.6, 0, -4.2]} /><Item kind="barrel" pos={[-3.2, 0, -3.6]} /></>}
      </>
    );
    case 'classroom': return (
      <>
        <Room w={11} d={8} wall={wall ?? '#f1ead8'} floor="wood" window={false} />
        <Screen pos={[0, 1.9, -3.9]} stand={false} w={4.4} h={1.6} bg="#2f6b4f" fg="#ffffff" text={name ?? '2 + 2 = 5'} /><Desk pos={[-3.6, 0, -2.6]} /><Item kind="apple" pos={[-3.4, 0.75, -2.6]} /><Item kind="globe" pos={[-4, 0.75, -2.6]} />
        {[-2.4, 0, 2.4].map((x) => [1.2, 3].map((z) => <React.Fragment key={`${x}${z}`}><Table pos={[x, 0, z]} size={[1.1, 0.6]} h={0.65} /><Chair pos={[x, 0, z + 0.6]} face={180} scale={0.9} /></React.Fragment>))}
        <Window pos={[-5.3, 1.9, 0]} face={90} w={2.4} night={night} /><Shelf pos={[4.7, 0, -3.6]} /><Item kind="clock" pos={[3.4, 2.8, -3.94]} />
      </>
    );
    case 'gym': return (
      <>
        <Room w={11} d={8} wall={wall ?? '#d9dde2'} floor="concrete" window={false} />
        <P shape="box" size={[5, 2.2, 0.04]} pos={[0, 1.6, -3.94]} color="#bfe1f5" shine={1} />
        {[-3.6, -2.8, 2.8, 3.6].map((x, i) => <Item key={x} kind="dumbbell" pos={[x, 0, -2.6]} scale={1.4 + (i % 2) * 0.4} color={i % 2 ? a : undefined} />)}
        <Bench pos={[-3.2, 0, -0.6]} face={90} color="#22252b" /><Rug pos={[2.8, 0, 0.4]} size={[1.9, 0.8]} color="#5fb66a" /><Rug pos={[2.8, 0, 1.6]} size={[1.9, 0.8]} color="#5b9bd5" />
        <Item kind="ball" pos={[4.4, 0, -3]} scale={2.2} color={a} /><Item kind="bottle" pos={[-4.6, 0, 1]} color="#5fb0ff" /><Sign pos={[0, 3.0, -3.9]} text={name ?? 'NO PAIN NO GAIN'} bg="#22252b" fg="#ffffff" w={4} h={0.5} pole={0} />
      </>
    );
    case 'hospital': return (
      <>
        <Room w={9} d={7} wall={wall ?? '#e3f0ee'} floor="tiles" window={false} />
        <Bed pos={[-1.8, 0, -2.2]} color="#bfe1f5" /><P shape="cyl" size={[0.04, 1.9, 0.04]} pos={[-0.6, 0.95, -3]} color="#c9ccd1" metal={0.7} /><P size={[0.2, 0.3, 0.08]} pos={[-0.6, 1.8, -3]} radius={0.04} color="#dff4ff" opacity={0.7} />
        <Tv pos={[2.6, 0, -3.1]} w={1.0} screen="#0f2a1c" text="♥ 72" /><Chair pos={[0.8, 0, -1.6]} face={-60} /><Cabinet pos={[3.6, 0, -0.8]} face={-90} w={2} />
        <Item kind="syringe" pos={[3.6, 0.96, -0.5]} /><Item kind="pill" pos={[3.6, 0.96, -1.1]} /><Item kind="thermometer" pos={[3.5, 0.96, -0.2]} /><Window pos={[1.2, 1.9, -3.48]} night={night} /><Sign pos={[-3.2, 2.5, -3.44]} text="+" bg="#ffffff" fg="#e0352f" w={0.7} h={0.7} pole={0} />
      </>
    );
    case 'street': return (
      <>
        <Ground kind="concrete" /><Road face={90} from={-80} to={80} width={7} walk /><Clouds />
        <Shop pos={[-9, 0, -10]} name={name ?? 'PIEKARNIA'} awning={a} /><Block pos={[6, 0, -12.5]} floors={5} w={12} /><House pos={[20, 0, -11]} wall="#f1e3c8" /><Shop pos={[-22, 0, -10]} name="KWIATY" awning="#2f7d4f" wall="#e3ecdf" />
        {[-15, -3, 9, 21].map((x) => <StreetLamp key={x} pos={[x, 0, -5.2]} on={night} />)}
        <Bench pos={[1.5, 0, -6.2]} /><Bin pos={[3.2, 0, -6.2]} /><Tree pos={[-2.5, 0, -6.4]} kind="round" scale={0.9} /><Tree pos={[13, 0, -6.4]} kind="round" scale={0.9} />
        <Block pos={[-6, 0, 16]} face={180} floors={4} wall="#d9cdbd" /><House pos={[12, 0, 15]} face={180} wall="#dfe8ee" roof="#5d6b7a" /><Trees from={-30} to={30} side={22} spread={10} gap={10} kinds={['round']} />
      </>
    );
    case 'park': return (
      <>
        <Ground /><Clouds /><Path from={-40} to={40} width={2.6} face={90} /><Path x={0} from={-30} to={-1.3} width={2.2} />
        <Fountain pos={[0, 0, -9]} /><Bench pos={[-3.6, 0, -2.4]} /><Bench pos={[3.6, 0, -2.4]} /><StreetLamp pos={[-6, 0, -2.2]} on={night} /><StreetLamp pos={[6, 0, -2.2]} on={night} /><Bin pos={[5, 0, -2.4]} />
        <Tree pos={[-7, 0, -6]} kind="round" /><Tree pos={[7.5, 0, -7]} kind="blossom" /><Tree pos={[-11, 0, -12]} kind="birch" /><Tree pos={[12, 0, -13]} kind="round" scale={1.2} /><Tree pos={[-4, 0, -15]} kind="pine" /><Tree pos={[5, 0, -17]} kind="round" />
        <Bush pos={[-5.2, 0, -3.4]} flowers="#ff8fb1" /><Bush pos={[2, 0, -5]} /><Flowers pos={[-2.5, 0, -5]} size={[3, 2]} /><Flowers pos={[4.5, 0, -5.5]} size={[3, 2]} seed="b" /><Grass pos={[0, 0, 4]} size={[16, 5]} />
        <Trees from={-40} to={40} side={20} spread={25} gap={8} kinds={['round', 'pine', 'birch']} />
      </>
    );
    case 'garden': return (
      <>
        <Ground /><Clouds /><House pos={[0, 0, -10]} wall={wall ?? '#f1e9da'} roof={a} /><Path from={-7} to={6} width={1.6} />
        <Fence pos={[-7, 0, 5]} length={11} kind="picket" /><Fence pos={[7, 0, 5]} length={11} kind="picket" /><Fence pos={[-12.4, 0, -2]} face={90} length={14} kind="picket" /><Fence pos={[12.4, 0, -2]} face={90} length={14} kind="picket" />
        <Tree pos={[-7, 0, -3]} kind="apple" /><Tree pos={[8, 0, -5]} kind="round" /><Bush pos={[-3.4, 0, -6.2]} flowers="#ffd34d" /><Bush pos={[3.4, 0, -6.2]} flowers="#ff8fb1" />
        <Flowers pos={[-4, 0, 1]} size={[4, 3]} /><Flowers pos={[4.5, 0, 0.5]} size={[4, 3]} seed="g2" /><Item kind="watering-can" pos={[2.4, 0, -1]} /><Item kind="mailbox" pos={[1.4, 0, 5.4]} /><Bench pos={[6, 0, -1.5]} face={-70} /><Grass pos={[0, 0, 1]} size={[20, 9]} count={50} />
      </>
    );
    case 'playground': return (
      <>
        <Ground /><Clouds /><P shape="disc" size={[13, 0.04, 13]} pos={[0, 0.02, -4]} color="#e8d6a0" />
        <group position={[-3.4, 0, -6]}><P shape="box" size={[0.12, 2.4, 0.12]} pos={[-1.2, 1.2, 0]} color={a} /><P shape="box" size={[0.12, 2.4, 0.12]} pos={[1.2, 1.2, 0]} color={a} /><P shape="box" size={[2.6, 0.12, 0.12]} pos={[0, 2.4, 0]} color={a} />{[-0.5, 0.5].map((x) => <React.Fragment key={x}>{[-0.2, 0.2].map((o) => <P key={o} shape="cyl" size={[0.02, 1.7, 0.02]} pos={[x + o, 1.5, 0]} color="#5d6066" />)}<P shape="box" size={[0.5, 0.05, 0.22]} pos={[x, 0.66, 0]} color="#22252b" /></React.Fragment>)}</group>
        <group position={[3.4, 0, -6.5]}><P shape="box" size={[1.3, 0.1, 1.3]} pos={[0, 1.6, 0]} color="#f2c230" />{[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([x, z], i) => <P key={i} shape="box" size={[0.1, 1.6, 0.1]} pos={[x, 0.8, z]} color="#3f6fb5" />)}<P shape="box" size={[0.9, 0.06, 2.6]} pos={[0, 0.84, 1.75]} rot={[33, 0, 0]} color={a} /><P shape="prism" size={[1.5, 0.9, 1.5]} pos={[0, 2.9, 0]} color="#3f6fb5" /></group>
        <Item kind="ball" pos={[0.8, 0, -2.6]} color="#ffffff" /><Bench pos={[0, 0, -11]} /><Tree pos={[-8, 0, -9]} kind="round" /><Tree pos={[8.5, 0, -10]} kind="round" /><Fence pos={[0, 0, -13]} length={22} kind="wood" /><Trees from={-30} to={30} side={18} spread={18} kinds={['round']} />
      </>
    );
    case 'beach': return (
      <>
        <Ground kind="sand" /><Water pos={[0, 0, -75]} size={[500, 120]} /><Clouds count={5} /><SkyDisc />
        <Tree pos={[-6, 0, -5]} kind="palm" /><Tree pos={[7, 0, -7]} kind="palm" scale={1.2} /><Tree pos={[-12, 0, -9]} kind="palm" scale={0.9} />
        <Item kind="umbrella" pos={[-2.6, 0, -3.2]} scale={1.7} color={a} /><Rug pos={[-2.6, 0, -2.6]} size={[1, 2]} color="#5fb0ff" /><Item kind="umbrella" pos={[3.4, 0, -4.4]} scale={1.7} color="#f2c230" /><Rug pos={[3.4, 0, -3.8]} size={[1, 2]} color="#ff8fb1" />
        <Item kind="ball" pos={[1, 0, -1.8]} scale={1.5} color="#ffffff" /><Item kind="bucket" pos={[-0.8, 0, -2.4]} color={a} /><Rock pos={[9, 0, -3]} /><Rock pos={[-9.5, 0, -2]} size={0.7} />
      </>
    );
    case 'farm': return (
      <>
        <Ground /><Clouds /><Barn pos={[-9, 0, -14]} /><House pos={[10, 0, -15]} wall="#f1e9da" />
        <Fence pos={[0, 0, -6]} length={18} /><Fence pos={[-9, 0, -1]} face={90} length={10} /><Fence pos={[9, 0, -1]} face={90} length={10} />
        <P shape="box" size={[14, 0.05, 6]} pos={[0, 0.03, 9]} color="#8b6b45" />{[-5, -2.5, 0, 2.5, 5].map((x) => [7, 9, 11].map((z) => <Bush key={`${x}${z}`} pos={[x, 0, z]} scale={0.45} color="#4cae4f" />))}
        {[[5.4, -4.4], [6.4, -4.4], [5.9, -4.4]].map(([x, z], i) => <group key={i} position={[x, i === 2 ? 0.86 : 0, z]}><P shape="cyl" size={[0.9, 1.0, 0.9]} pos={[0, 0.45, 0]} rot={[0, 0, 90]} color="#e2c06a" /></group>)}
        <Item kind="bucket" pos={[-4, 0, -4.6]} /><Tree pos={[-15, 0, -6]} kind="apple" /><Tree pos={[16, 0, -8]} kind="round" /><Mountains z={180} snow={false} color="#7f9a7a" height={36} />
      </>
    );
    case 'forest': return (
      <>
        <Ground color="#5d9a4a" /><Trees from={-45} to={12} side={5.5} spread={22} gap={4.5} kinds={['pine', 'pine', 'round', 'birch']} seed="forest" />
        <Tree pos={[-4.6, 0, -4]} kind="pine" scale={1.3} /><Tree pos={[5, 0, -5.5]} kind="pine" scale={1.5} /><Tree pos={[-2, 0, -12]} kind="round" scale={1.3} /><Tree pos={[2.5, 0, -16]} kind="pine" scale={1.6} /><Tree pos={[7, 0, 1]} kind="dead" />
        <Rock pos={[-3.2, 0, -1.6]} /><Rock pos={[3.6, 0, -2.4]} size={0.6} /><Item kind="log" pos={[2.4, 0, -0.6]} face={30} /><Item kind="mushroom" pos={[-2.2, 0, -0.4]} /><Item kind="mushroom" pos={[-2.6, 0, -0.8]} scale={0.7} /><Item kind="mushroom" pos={[3.1, 0, -1.2]} scale={0.8} color="#b98a55" />
        <Bush pos={[-5.5, 0, 0]} /><Bush pos={[5.6, 0, -1]} /><Grass pos={[0, 0, 0]} size={[14, 10]} count={60} color="#4f9a3d" /><Flowers pos={[0, 0, -3]} size={[5, 3]} count={10} />
      </>
    );
    case 'mountains': return (
      <>
        <Ground kind="snow" /><Mountains z={120} height={70} /><Mountains z={200} seed="m2" color="#8ea0b4" height={90} /><Clouds count={5} y={34} />
        {[[-6, -5, 1.2], [6.5, -7, 1.5], [-10, -12, 1.1], [11, -14, 1.3], [-3, -16, 1.4], [3, -11, 1]].map(([x, z, s], i) => <React.Fragment key={i}><Tree pos={[x, 0, z]} kind="pine" scale={s} color="#2f7d4f" /><P shape="cone" size={[1.6 * s, 0.8 * s, 1.6 * s]} pos={[x, 3.4 * s, z]} color="#f6f9fc" /></React.Fragment>)}
        <Rock pos={[-3.6, 0, -2]} color="#9aa3ad" /><Rock pos={[4.4, 0, -3]} size={1.4} color="#9aa3ad" /><Item kind="snowman" pos={[2.4, 0, -1.4]} /><Item kind="tent" pos={[-4.6, 0, -6]} color={a} /><Item kind="campfire" pos={[-2.4, 0, -4]} />
      </>
    );
    case 'city': return (
      <>
        <Ground kind="concrete" /><Clouds />
        <Tower pos={[-14, 0, -22]} floors={18} /><Tower pos={[2, 0, -30]} floors={26} color="#4f7396" w={12} /><Tower pos={[18, 0, -24]} floors={14} color="#6b93b3" /><Block pos={[-28, 0, -16]} floors={8} /><Block pos={[30, 0, -18]} floors={9} wall="#d9cdbd" /><Tower pos={[-34, 0, -40]} floors={30} color="#3f5f80" /><Tower pos={[36, 0, -44]} floors={24} />
        <Fountain pos={[0, 0, -9]} />{[-9, 9].map((x) => <React.Fragment key={x}><Bench pos={[x * 0.55, 0, -3.6]} /><StreetLamp pos={[x, 0, -4]} on={night} /><Tree pos={[x * 1.3, 0, -8]} kind="round" scale={0.9} /><P shape="box" size={[3, 0.5, 3]} pos={[x * 1.3, 0.25, -8]} color="#b9bcc0" /></React.Fragment>)}
        <Bin pos={[6.6, 0, -3.6]} /><Sign pos={[-7, 0, -13]} text={name ?? 'CENTRUM'} bg="#1d3f9e" w={3.2} h={0.9} />
      </>
    );
    case 'stage': return (
      <>
        <Ground kind="stage" /><group position={[0, 0, -3]}><Stage3D color={a === '#d8342c' ? '#8f1d2c' : a} /></group>
        <Item kind="mic" pos={[0, 0.84, -2.2]} />{name && <Sign pos={[0, 5.2, -4.9]} text={name} bg="#22252b" fg="#ffd34d" w={6} h={1} pole={0} />}
      </>
    );
    case 'space': return (
      <>
        <Ground kind="moon" /><Stars /><SkyDisc pos={[50, 70, -160]} size={34} color="#5fa8ff" />
        {[[-5, -3, 2.2], [6, -6, 3], [-9, -10, 4], [3, -1.5, 1.2], [10, -2, 1.6], [-2, -8, 2.6]].map(([x, z, s], i) => <React.Fragment key={i}><P shape="torus" size={[s, s * 0.14, 0]} pos={[x, 0.02, z]} rot={[90, 0, 0]} color="#8a8c9a" /><P shape="disc" size={[s * 0.84, 0.02, s * 0.84]} pos={[x, 0.01, z]} color="#7c7e8c" /></React.Fragment>)}
        <Rock pos={[-3.4, 0, -1.2]} color="#8a8c9a" /><Rock pos={[4.6, 0, -3.4]} size={1.3} color="#8a8c9a" /><Item kind="flag" pos={[2.2, 0, -2.4]} color={a} />
      </>
    );
    case 'desert': return (
      <>
        <Ground kind="sand" /><SkyDisc /><Mountains z={170} snow={false} color="#c98e62" height={30} />
        {[[-5, -4, 1.4], [6, -6, 1.8], [-10, -11, 1.2], [12, -12, 1.6], [2.8, -14, 1.3]].map(([x, z, s], i) => <group key={i} position={[x, 0, z]} scale={s}><P shape="capsule" size={[0.5, 2.6, 0.5]} pos={[0, 1.3, 0]} color="#4c9a4a" /><P shape="capsule" size={[0.3, 1.0, 0.3]} pos={[0.55, 1.5, 0]} color="#4c9a4a" /><P shape="capsule" size={[0.3, 0.6, 0.3]} pos={[0.32, 1.1, 0]} rot={[0, 0, 90]} color="#4c9a4a" /><P shape="capsule" size={[0.3, 0.8, 0.3]} pos={[-0.55, 1.2, 0]} color="#4c9a4a" /><P shape="capsule" size={[0.3, 0.6, 0.3]} pos={[-0.32, 0.9, 0]} rot={[0, 0, 90]} color="#4c9a4a" /></group>)}
        <Rock pos={[-3, 0, -2]} color="#b98a55" /><Rock pos={[4, 0, -3]} size={1.5} color="#b98a55" /><Tree pos={[8, 0, -2]} kind="dead" /><Item kind="bone" pos={[1.6, 0, -1.4]} scale={1.6} />
      </>
    );
    case 'studio': default: return (
      <>
        <Ground color={wall ?? '#efeaf7'} /><group position={[0, 0, -1]}><Podium color={a} /></group>
        <P shape="box" size={[60, 30, 0.2]} pos={[0, 15, -16]} color={wall ?? '#e6e0f2'} />
      </>
    );
  }
};
function shade2(hex: string) { return hex === '#f1e6d2' ? '#d9c7a8' : '#cfc6b8'; }
export type { V3 };
