import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as THREE from "three";
import { useApi } from "../useApi";
import { Card, ErrorBox, Loading, fmt } from "../components/ui";
import { T } from "../glossary";

type Point3D = { sampleCode: string; siteCode: string; siteName: string; lat: number; lon: number; depth: number | null; ageBP: number | null; individuals: number; habitat: string | null };
type Data3D = { points: Point3D[]; counts: { total: number; dated: number; withDepth: number } };

const HABITAT_COLORS: Record<string, number> = {
  "Wetlands/marshes": 0x2563eb, "Aquatics": 0x0891b2, "Wood and trees": 0x15803d, "Meadowland": 0x65a30d,
  "Heathland & moorland": 0x7c3aed, "Pasture/Dung": 0xa16207, "Dry dead wood": 0x92400e, "Carrion": 0xdc2626,
};
const NO_HABITAT_COLOR = 0x94a3b8;
const NO_DEPTH_Y = -40; // samples with no recorded depth are placed on a visible "unknown depth" floor plane, not hidden or faked at a guessed depth

export default function View3D() {
  const data = useApi<Data3D>("bugs/points3d");
  const [params] = useSearchParams();
  const focusSite = params.get("site");
  const [selected, setSelected] = useState<Point3D | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [moved, setMoved] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <p className="text-sm text-muted">
        Each dot is one dated <T k="sample">sample</T>: x/y from its site's coordinates, height (y) from years before present (<T k="bp">BP</T>) — older is higher — and colour from its most abundant <T k="habitat">habitat group</T>. Samples with no recorded depth sit on the grey floor plane rather than being hidden or given a made-up depth. Move with W/A/S/D + mouse-drag to look, scroll to zoom, or drag to orbit. Click a dot to open its record.
      </p>
      {data.error && <div className="mt-3"><ErrorBox error={data.error} /></div>}
      {!data.data && !data.error && <Loading what="Loading 3D points" />}
      {data.data && (
        <>
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span>{fmt(data.data.counts.total)} dated+undated samples shown</span>
            <span>{fmt(data.data.counts.dated)} with a date (placed by age)</span>
            <span>{fmt(data.data.counts.withDepth)} with a recorded depth</span>
          </div>
          <div className="relative mt-3">
            <Scene points={data.data.points} focusSite={focusSite} onPick={setSelected} onMove={() => setMoved(true)} mountRef={mountRef} />
            {!moved && <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-ink/80 px-3 py-1.5 text-xs text-paper">Drag to orbit · scroll to zoom · WASD to fly</div>}
          </div>
          <div className="mt-4">
            {!selected ? <p className="text-sm text-muted">Click a point to see its record.</p> : (
              <Card title={selected.siteName} subtitle={`sample ${selected.sampleCode}`}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <div><b>Individuals</b><div>{fmt(selected.individuals)}</div></div>
                  <div><b>Age</b><div>{selected.ageBP != null ? `${fmt(Math.round(selected.ageBP))} BP` : "undated"}</div></div>
                  <div><b>Depth</b><div>{selected.depth != null ? `${selected.depth} m` : "not recorded"}</div></div>
                  <div><b>Dominant habitat</b><div>{selected.habitat ?? "no habitat code"}</div></div>
                </div>
                <p className="mt-2 text-sm"><Link to={`/map?bugs=${selected.siteCode}`} className="text-link hover:underline">Open this site's page</Link></p>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Scene({ points, focusSite, onPick, onMove, mountRef }: { points: Point3D[]; focusSite: string | null; onPick: (p: Point3D) => void; onMove: () => void; mountRef: React.RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth, height = 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef1ee);
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 4000);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const grid = new THREE.GridHelper(600, 30, 0xccd6cd, 0xccd6cd);
    grid.position.y = NO_DEPTH_Y;
    scene.add(grid);

    // project lat/lon to a flat local plane (equirectangular, fine at this zoom-out scale for visual layout, not for measurement)
    const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
    const latMid = (Math.min(...lats) + Math.max(...lats)) / 2;
    const scale = 4;
    const toXZ = (lat: number, lon: number): [number, number] => [(lon - (Math.min(...lons) + Math.max(...lons)) / 2) * scale * Math.cos((latMid * Math.PI) / 180), -(lat - latMid) * scale];
    const ages = points.map(p => p.ageBP).filter((a): a is number => a != null);
    const maxAge = Math.max(...ages, 1);
    const ageToY = (bp: number) => (bp / maxAge) * 260;

    // one InstancedMesh draw call for all points (thousands of individual meshes is too slow to render)
    const geom = new THREE.SphereGeometry(1.6, 8, 8);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    const inst = new THREE.InstancedMesh(geom, mat, points.length);
    const focus = points.find(p => p.siteCode === focusSite);
    const dummy = new THREE.Object3D();
    const colorArr = new Float32Array(points.length * 3);
    const tmpColor = new THREE.Color();
    points.forEach((p, i) => {
      const [x, z] = toXZ(p.lat, p.lon);
      const y = p.ageBP != null ? ageToY(p.ageBP) : NO_DEPTH_Y;
      const isFocus = !!focus && p.siteCode === focus.siteCode;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(isFocus ? 2.2 : Math.min(3, 0.8 + Math.log10(p.individuals + 1)));
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      const color = isFocus ? 0xffcc00 : p.habitat && HABITAT_COLORS[p.habitat] != null ? HABITAT_COLORS[p.habitat] : NO_HABITAT_COLOR;
      tmpColor.setHex(color);
      colorArr[i * 3] = tmpColor.r; colorArr[i * 3 + 1] = tmpColor.g; colorArr[i * 3 + 2] = tmpColor.b;
    });
    inst.instanceMatrix.needsUpdate = true;
    geom.setAttribute("color", new THREE.InstancedBufferAttribute(colorArr, 3));
    (inst as any).instanceColor = new THREE.InstancedBufferAttribute(colorArr, 3);
    scene.add(inst);
    const meshes = [inst];

    const startTarget = focus ? new THREE.Vector3(...toXZ(focus.lat, focus.lon), 0) : new THREE.Vector3(0, 40, 0);
    startTarget.y = focus?.ageBP != null ? ageToY(focus.ageBP) : NO_DEPTH_Y;
    camera.position.set(startTarget.x + 120, startTarget.y + 90, (toXZ(focus?.lat ?? latMid, focus?.lon ?? 0)[1] ?? 0) + 120);
    camera.lookAt(startTarget);

    // orbit-by-drag + WASD fly + scroll zoom, no external control library needed
    let yaw = Math.atan2(camera.position.x - startTarget.x, camera.position.z - startTarget.z);
    let pitch = 0.4;
    let radius = camera.position.distanceTo(startTarget);
    const target = startTarget.clone();
    const keys = new Set<string>();
    let dragging = false, lastX = 0, lastY = 0;

    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMoveEvt = (e: PointerEvent) => {
      if (!dragging) return;
      onMove();
      yaw -= (e.clientX - lastX) * 0.005;
      pitch = Math.max(-1.3, Math.min(1.3, pitch + (e.clientY - lastY) * 0.005));
      lastX = e.clientX; lastY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => { onMove(); radius = Math.max(10, Math.min(800, radius + e.deltaY * 0.4)); };
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(meshes)[0];
      if (hit && hit.instanceId != null) onPick(points[hit.instanceId]);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMoveEvt);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    renderer.domElement.addEventListener("click", onClick);

    let raf = 0;
    const tick = () => {
      if (keys.size) onMove();
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const speed = 2.5;
      if (keys.has("w")) target.addScaledVector(fwd, -speed);
      if (keys.has("s")) target.addScaledVector(fwd, speed);
      if (keys.has("a")) target.addScaledVector(right, -speed);
      if (keys.has("d")) target.addScaledVector(right, speed);
      if (keys.has("q")) target.y -= speed;
      if (keys.has("e")) target.y += speed;
      camera.position.set(
        target.x + radius * Math.sin(yaw) * Math.cos(pitch),
        target.y + radius * Math.sin(pitch) + 20,
        target.z + radius * Math.cos(yaw) * Math.cos(pitch),
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMoveEvt);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("click", onClick);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, focusSite]);

  return <div ref={mountRef} className="h-[560px] w-full overflow-hidden rounded-xl border border-line" />;
}
