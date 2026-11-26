"""
Build 8 museum-grade F1 trophy PBR GLB models via headless Blender 5.3:
  1. fia_wdc_trophy.glb      - Real Fox Silver FIA World Drivers' Championship Trophy
  2. fia_wcc_trophy.glb      - FIA World Constructors' Championship Wing Trophy
  3. pirelli_pole_award.glb  - Pirelli Pole Position Wind-Tunnel Mini-Tyre on Stand
  4. dhl_fastest_lap_award.glb - DHL Fastest Lap Dynamic Vortex Ribbon Sculpture
  5. gp_trophy_classic.glb   - Classic Royal Urn & Twin Handles (GP_Metal_Primary tintable)
  6. gp_trophy_monaco.glb    - Architectural Portal Monolith (GP_Metal_Primary tintable)
  7. gp_trophy_modern.glb    - Twisted Aero Ribbon Tower (GP_Metal_Primary tintable)
  8. gp_trophy_chalice.glb   - Modern Ringed Goblet Chalice (GP_Metal_Primary tintable)

Run with:
  "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" --background --python "scripts/blender/build_f1_trophies.py"
"""

import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
OUT_DIR = os.path.join(REPO_ROOT, "public", "assets", "3d", "models", "trophies")
PREVIEW_PATH = r"C:\Users\utente\.gemini\antigravity\brain\1886e128-6f59-42dc-b7ca-b3ba3030cce3\scratch\trophies_preview.png"


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(
    name,
    color,
    metallic=0.0,
    roughness=0.35,
    coat_weight=0.0,
    coat_roughness=0.1,
    emission=None,
    emission_strength=0.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = coat_weight
        if "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = coat_roughness
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (
                emission[0],
                emission[1],
                emission[2],
                1.0,
            )
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def hex_to_linear(hex_str):
    s = hex_str.lstrip("#")
    r, g, b = (int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0)

    def srgb_to_lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b))


def ensure_collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def link_obj(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def set_smooth_with_edges(obj, angle_deg=38.0):
    if obj.type != "MESH":
        return
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    mod = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
    mod.keep_sharp = True
    # Add subtle edge split for crisp plinth edges
    es = obj.modifiers.new(name="EdgeSplit", type="EDGE_SPLIT")
    es.split_angle = math.radians(angle_deg)
    es.use_edge_angle = True


def create_lathe_mesh(name, profile_rz, segments=64, material=None, col=None, angle_deg=42.0):
    """Spins a 2D (radius, z) profile around Z axis cleanly into a closed/lathed mesh."""
    bm = bmesh.new()
    verts = [bm.verts.new((max(0.0, r), 0.0, z)) for (r, z) in profile_rz]
    edges = []
    for i in range(len(verts) - 1):
        edges.append(bm.edges.new((verts[i], verts[i + 1])))

    geom = verts + edges
    bmesh.ops.spin(
        bm,
        geom=geom,
        cent=(0.0, 0.0, 0.0),
        axis=(0.0, 0.0, 1.0),
        angle=math.tau,
        steps=segments,
        use_merge=True,
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    if material:
        obj.data.materials.append(material)
    if col:
        link_obj(obj, col)
    set_smooth_with_edges(obj, angle_deg=angle_deg)
    return obj


def create_ribbon_tube(
    name,
    points,
    radius_u=0.008,
    radius_v=0.003,
    resolution=16,
    material=None,
    col=None,
    closed=False,
    tilt_rad=0.0,
):
    """Creates a smooth extruded ribbon or tube along a 3D spline."""
    curve_data = bpy.data.curves.new(name=f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = resolution
    curve_data.twist_mode = "MINIMUM"

    spline = curve_data.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for idx, pt in enumerate(points):
        spline.points[idx].co = (pt[0], pt[1], pt[2], 1.0)
        if tilt_rad != 0.0:
            spline.points[idx].tilt = tilt_rad
    spline.use_endpoint_u = not closed
    spline.use_cyclic_u = closed
    spline.order_u = min(4, len(points))

    # Build rectangular/chamfered bevel profile object so ribbon has crisp flat face
    prof_curve = bpy.data.curves.new(name=f"{name}_Prof", type="CURVE")
    prof_curve.dimensions = "2D"
    ps = prof_curve.splines.new("POLY")
    hw, hh = radius_u, radius_v
    cham = min(hw, hh) * 0.25
    ring = [
        (-hw + cham, -hh),
        (hw - cham, -hh),
        (hw, -hh + cham),
        (hw, hh - cham),
        (hw - cham, hh),
        (-hw + cham, hh),
        (-hw, hh - cham),
        (-hw, -hh + cham),
    ]
    ps.points.add(len(ring) - 1)
    for idx, (px, py) in enumerate(ring):
        ps.points[idx].co = (px, py, 0.0, 1.0)
    ps.use_cyclic_u = True

    prof_obj = bpy.data.objects.new(f"{name}_ProfObj", prof_curve)
    link_obj(prof_obj, col)

    curve_data.bevel_mode = "OBJECT"
    curve_data.bevel_object = prof_obj
    curve_data.use_fill_caps = True

    curve_obj = bpy.data.objects.new(name, curve_data)
    if material:
        curve_obj.data.materials.append(material)
    link_obj(curve_obj, col)

    bpy.context.view_layer.objects.active = curve_obj
    curve_obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.active_object
    mesh_obj.select_set(False)

    # Clean temporary bevel profile object
    bpy.data.objects.remove(prof_obj, do_unlink=True)
    bpy.data.curves.remove(prof_curve, do_unlink=True)

    set_smooth_with_edges(mesh_obj, angle_deg=48.0)
    return mesh_obj


def add_cylinder(name, radius, depth, z_bottom, segments=48, material=None, col=None):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segments,
        radius=radius,
        depth=depth,
        location=(0.0, 0.0, z_bottom + depth * 0.5),
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    if col:
        link_obj(obj, col)
    set_smooth_with_edges(obj, angle_deg=36.0)
    return obj


def add_box(name, sx, sy, sz, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.004, material=None, col=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bv = obj.modifiers.new(name="Bevel", type="BEVEL")
        bv.width = bevel
        bv.segments = 3
        bv.limit_method = "ANGLE"
    if material:
        obj.data.materials.append(material)
    if col:
        link_obj(obj, col)
    set_smooth_with_edges(obj, angle_deg=35.0)
    return obj


def normalize_and_export(col, filename):
    objs = [o for o in col.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

    # Apply modifiers & transforms
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception:
                pass

    # Join into clean multi-material mesh or keep hierarchy parented to clean Empty at origin
    min_z = min((o.matrix_world @ Vector(b)).z for o in objs for b in o.bound_box)
    for o in objs:
        o.location.z -= min_z

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # Compute overall bounds
    min_v = Vector((1e9, 1e9, 1e9))
    max_v = Vector((-1e9, -1e9, -1e9))
    tri_count = 0
    for o in objs:
        for b in o.bound_box:
            wv = o.matrix_world @ Vector(b)
            min_v.x = min(min_v.x, wv.x)
            min_v.y = min(min_v.y, wv.y)
            min_v.z = min(min_v.z, wv.z)
            max_v.x = max(max_v.x, wv.x)
            max_v.y = max(max_v.y, wv.y)
            max_v.z = max(max_v.z, wv.z)
        tri_count += sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)

    out_path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
    )
    size_bytes = os.path.getsize(out_path)
    dims = max_v - min_v
    print(
        f"[GLB] {filename:28s} | {size_bytes:8d} B | {tri_count:6d} tris | "
        f"size=({dims.x:.3f}, {dims.y:.3f}, {dims.z:.3f})m"
    )
    return objs


# ---------------------------------------------------------------------------
# 1. REAL FIA WORLD DRIVERS' CHAMPIONSHIP TROPHY (Fox Silver 1995 design)
# ---------------------------------------------------------------------------
def build_fia_wdc_trophy():
    col = ensure_collection("Trophy_FIA_WDC")
    mat_obsidian = make_material("FIA_Obsidian_Base", hex_to_linear("#10141c"), metallic=0.18, roughness=0.22, coat_weight=0.5)
    mat_silver = make_material("FIA_Sterling_Silver", hex_to_linear("#eef3fa"), metallic=0.98, roughness=0.09)
    mat_gold = make_material("FIA_Gold_24K", hex_to_linear("#f2c544"), metallic=0.98, roughness=0.13)
    mat_cobalt = make_material("FIA_Cobalt_Enamel", hex_to_linear("#1241a6"), metallic=0.22, roughness=0.11, coat_weight=0.95, coat_roughness=0.05)

    # Stepped dark circular base (z: 0 -> 0.125)
    base_profile = [
        (0.0, 0.0),
        (0.148, 0.0),
        (0.148, 0.016),
        (0.138, 0.024),
        (0.134, 0.068),
        (0.122, 0.078),
        (0.118, 0.114),
        (0.104, 0.124),
        (0.0, 0.124),
    ]
    create_lathe_mesh("WDC_Base_Plinth", base_profile, 64, mat_obsidian, col, angle_deg=32.0)

    # Gold base collar trims & engraved band
    trim1 = [
        (0.133, 0.022), (0.139, 0.024), (0.139, 0.030), (0.133, 0.032), (0.133, 0.022)
    ]
    create_lathe_mesh("WDC_Base_Trim_Lower", trim1, 64, mat_gold, col)
    trim2 = [
        (0.116, 0.075), (0.124, 0.079), (0.124, 0.087), (0.116, 0.089), (0.116, 0.075)
    ]
    create_lathe_mesh("WDC_Base_Trim_Upper", trim2, 64, mat_gold, col)

    # 3D sculpted gold laurel wreath buds encircling top base step
    laurel_count = 24
    for i in range(laurel_count):
        ang = (i / laurel_count) * math.tau
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.011, location=(0, 0, 0))
        leaf = bpy.context.active_object
        leaf.name = f"WDC_Laurel_{i}"
        leaf.scale = (0.55, 1.35, 0.42)
        leaf.rotation_euler = Euler((0.28, 0.25 if i % 2 == 0 else -0.25, ang + math.pi * 0.5))
        leaf.location = (math.cos(ang) * 0.114, math.sin(ang) * 0.114, 0.100)
        leaf.data.materials.append(mat_gold)
        link_obj(leaf, col)
        set_smooth_with_edges(leaf, angle_deg=60.0)

    # Tapered sterling silver central column (flared foot -> slim waist -> crown bell, z: 0.124 -> 0.465)
    col_profile = [
        (0.0, 0.124),
        (0.092, 0.124),
        (0.082, 0.145),
        (0.068, 0.195),
        (0.056, 0.275),
        (0.051, 0.355),
        (0.055, 0.415),
        (0.066, 0.452),
        (0.072, 0.466),
        (0.058, 0.474),
        (0.0, 0.474),
    ]
    create_lathe_mesh("WDC_Silver_Tower", col_profile, 64, mat_silver, col, angle_deg=55.0)

    def column_r_at_z(z_val):
        # Smooth analytical approximation of silver tower radius so spiral hugs cleanly just outside it
        t = max(0.0, min(1.0, (z_val - 0.132) / (0.458 - 0.132)))
        return 0.087 * (1 - t) ** 2 + 0.044 * 2 * (1 - t) * t + 0.068 * (t ** 2)

    # Continuous 3D 24k gold helical spiral ribbon winding 3.4 turns upward
    spiral_pts = []
    n_pts = 110
    turns = 3.35
    for k in range(n_pts):
        t = k / (n_pts - 1)
        z = 0.134 + t * (0.458 - 0.134)
        theta = t * turns * math.tau
        r = column_r_at_z(z) + 0.0085
        spiral_pts.append((math.cos(theta) * r, math.sin(theta) * r, z))

    create_ribbon_tube(
        "WDC_Gold_Helical_Spiral",
        spiral_pts,
        radius_u=0.0055,
        radius_v=0.0095,
        resolution=8,
        material=mat_gold,
        col=col,
    )

    # Gold crown pedestal cradle under globe
    cradle = [
        (0.0, 0.470),
        (0.062, 0.470),
        (0.068, 0.482),
        (0.048, 0.494),
        (0.036, 0.504),
        (0.0, 0.504),
    ]
    create_lathe_mesh("WDC_Crown_Collar", cradle, 48, mat_gold, col)

    # Cobalt-blue enamelled world globe
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=0.068, location=(0.0, 0.0, 0.562))
    globe = bpy.context.active_object
    globe.name = "WDC_Cobalt_Globe"
    globe.data.materials.append(mat_cobalt)
    link_obj(globe, col)
    set_smooth_with_edges(globe, angle_deg=70.0)

    # Gold meridian + equatorial rings around the cobalt globe
    for ring_idx, rot_e in enumerate([
        Euler((math.radians(90), 0.0, 0.0)),
        Euler((math.radians(24), math.radians(32), 0.0)),
        Euler((math.radians(-24), math.radians(-38), math.radians(55))),
    ]):
        bpy.ops.mesh.primitive_torus_add(
            major_segments=56,
            minor_segments=14,
            major_radius=0.0715,
            minor_radius=0.0032,
            location=(0.0, 0.0, 0.562),
            rotation=rot_e,
        )
        ring = bpy.context.active_object
        ring.name = f"WDC_Globe_Ring_{ring_idx}"
        ring.data.materials.append(mat_gold)
        link_obj(ring, col)
        set_smooth_with_edges(ring, angle_deg=60.0)

    # Gold top finial
    add_cylinder("WDC_Finial_Tip", 0.011, 0.022, 0.628, 24, mat_gold, col)
    return normalize_and_export(col, "fia_wdc_trophy.glb")


# ---------------------------------------------------------------------------
# 2. FIA WORLD CONSTRUCTORS' CHAMPIONSHIP TROPHY
# ---------------------------------------------------------------------------
def build_fia_wcc_trophy():
    col = ensure_collection("Trophy_FIA_WCC")
    mat_dark = make_material("WCC_Slate_Base", hex_to_linear("#161b24"), metallic=0.25, roughness=0.28)
    mat_silver = make_material("WCC_Aero_Silver", hex_to_linear("#e8eef6"), metallic=0.96, roughness=0.12)
    mat_gold = make_material("WCC_Champagne_Gold", hex_to_linear("#ebbf4a"), metallic=0.97, roughness=0.14)
    mat_blue = make_material("WCC_Accent_Blue", hex_to_linear("#1d4ed8"), metallic=0.35, roughness=0.16, coat_weight=0.8)

    base_prof = [
        (0.0, 0.0), (0.135, 0.0), (0.135, 0.025), (0.118, 0.036),
        (0.114, 0.088), (0.096, 0.098), (0.0, 0.098),
    ]
    create_lathe_mesh("WCC_Base", base_prof, 48, mat_dark, col)
    create_lathe_mesh("WCC_Ring", [(0.112, 0.032), (0.122, 0.036), (0.122, 0.044), (0.112, 0.046)], 48, mat_gold, col)

    # Central faceted spire
    spire_prof = [
        (0.0, 0.098), (0.044, 0.098), (0.032, 0.25), (0.018, 0.44), (0.004, 0.51), (0.0, 0.51)
    ]
    create_lathe_mesh("WCC_Core_Spire", spire_prof, 8, mat_blue, col, angle_deg=25.0)

    # Twin sweeping sculpted aerodynamic wing blades
    for idx, (phase, rad_u, rad_v, mat) in enumerate([
        (0.0, 0.008, 0.018, mat_silver),
        (math.pi, 0.008, 0.018, mat_gold),
    ]):
        pts = []
        steps = 48
        for k in range(steps):
            t = k / (steps - 1)
            z = 0.096 + t * 0.455
            ang = phase + t * 2.15 * math.pi
            r = 0.072 * (1.0 - 0.35 * t) + 0.024 * math.sin(t * math.pi)
            pts.append((math.cos(ang) * r, math.sin(ang) * r, z))
        create_ribbon_tube(f"WCC_Wing_{idx}", pts, rad_u, rad_v, 10, mat, col)

    return normalize_and_export(col, "fia_wcc_trophy.glb")


# ---------------------------------------------------------------------------
# 3. PIRELLI POLE POSITION WIND-TUNNEL MINI-TYRE AWARD
# ---------------------------------------------------------------------------
def build_pirelli_pole_award():
    col = ensure_collection("Trophy_Pirelli_Pole")
    mat_stand = make_material("Pirelli_Stand_Black", hex_to_linear("#161a22"), metallic=0.25, roughness=0.30)
    mat_alu = make_material("Pirelli_Alu_Plaque", hex_to_linear("#cfd7e2"), metallic=0.90, roughness=0.20)
    mat_rubber = make_material("Pirelli_Slick_Rubber", hex_to_linear("#16191f"), metallic=0.02, roughness=0.72)
    mat_red = make_material("Pirelli_Soft_Red", hex_to_linear("#e10600"), metallic=0.12, roughness=0.32)
    mat_rim = make_material("Pirelli_Forged_Rim", hex_to_linear("#3b4250"), metallic=0.88, roughness=0.26)
    mat_nut = make_material("Pirelli_Center_Nut", hex_to_linear("#f0c040"), metallic=0.95, roughness=0.18)

    # Display base stand (z: 0 -> 0.048)
    add_box("Pirelli_Plinth", 0.21, 0.145, 0.036, loc=(0, 0, 0.018), bevel=0.005, material=mat_stand, col=col)
    add_box("Pirelli_Front_Plate", 0.15, 0.004, 0.018, loc=(0, -0.073, 0.018), bevel=0.001, material=mat_alu, col=col)
    # Brushed aluminium neck support rising to cradle tyre
    add_box("Pirelli_Support_Neck", 0.046, 0.055, 0.075, loc=(0, 0.018, 0.062), rot=(math.radians(-18), 0, 0), bevel=0.003, material=mat_alu, col=col)

    # Build tyre in local Y-axis (facing -Y viewer cleanly), then tilt slightly backward
    # Lathe profile revolved around Z then rotated X=90deg -> tyre faces -Y!
    # Radius: rim=0.054, outer=0.094, half-width=0.056
    tyre_prof = [
        (0.052, -0.050),
        (0.072, -0.056),
        (0.090, -0.054),
        (0.095, -0.044),
        (0.096, 0.0),
        (0.095, 0.044),
        (0.090, 0.054),
        (0.072, 0.056),
        (0.052, 0.050),
    ]
    tyre_obj = create_lathe_mesh("Pirelli_Tyre_Body", tyre_prof, 64, mat_rubber, col, angle_deg=60.0)
    tyre_obj.rotation_euler = Euler((math.radians(74), 0, 0))
    tyre_obj.location = (0.0, -0.004, 0.154)

    # Soft Red sidewall stripe on front face
    bpy.ops.mesh.primitive_torus_add(
        major_segments=64, minor_segments=12,
        major_radius=0.072, minor_radius=0.0032,
        location=(0, 0, 0),
    )
    stripe = bpy.context.active_object
    stripe.name = "Pirelli_Red_Band"
    stripe.scale = (1.0, 1.0, 0.45)
    stripe.rotation_euler = Euler((math.radians(74), 0, 0))
    # Offset along tilted tyre front normal
    ang_tilt = math.radians(74)
    ny = -math.sin(ang_tilt) * 0.0555
    nz = math.cos(ang_tilt) * 0.0555
    stripe.location = (0.0, -0.004 + ny, 0.154 + nz)
    stripe.data.materials.append(mat_red)
    link_obj(stripe, col)
    set_smooth_with_edges(stripe, 65.0)

    # Forged inner barrel + spokes hub
    rim_prof = [
        (0.0, -0.042), (0.018, -0.042), (0.022, -0.036), (0.048, -0.036),
        (0.054, -0.050), (0.054, 0.050), (0.045, 0.042), (0.018, 0.042), (0.0, 0.042),
    ]
    rim = create_lathe_mesh("Pirelli_Wheel_Rim", rim_prof, 48, mat_rim, col, angle_deg=35.0)
    rim.rotation_euler = Euler((math.radians(74), 0, 0))
    rim.location = (0.0, -0.004, 0.154)

    # 10 radial Y-spokes inside front rim dish
    spoke_group_offset = Vector((0.0, -math.sin(ang_tilt) * 0.039, math.cos(ang_tilt) * 0.039))
    tyre_center = Vector((0.0, -0.004, 0.154)) + spoke_group_offset
    for s_idx in range(10):
        a = (s_idx / 10.0) * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1.0)
        sp = bpy.context.active_object
        sp.name = f"Pirelli_Spoke_{s_idx}"
        sp.scale = (0.0055, 0.034, 0.006)
        bpy.ops.object.transform_apply(scale=True)
        rot_tyre = Euler((math.radians(74), 0, 0)).to_matrix().to_4x4()
        rot_spin = Matrix.Rotation(a, 4, "Z")
        local_pos = rot_spin @ Vector((0.0, 0.034, 0.0))
        sp.matrix_world = Matrix.Translation(tyre_center) @ rot_tyre @ Matrix.Translation(local_pos) @ rot_spin
        sp.data.materials.append(mat_rim)
        link_obj(sp, col)
        set_smooth_with_edges(sp, 35.0)

    # Center-lock nut
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.013, depth=0.016)
    nut = bpy.context.active_object
    nut.name = "Pirelli_Center_Nut"
    nut.rotation_euler = Euler((math.radians(74), 0, 0))
    nut.location = Vector((0.0, -0.004, 0.154)) + Vector((0.0, -math.sin(ang_tilt) * 0.044, math.cos(ang_tilt) * 0.044))
    nut.data.materials.append(mat_nut)
    link_obj(nut, col)
    set_smooth_with_edges(nut, 30.0)

    return normalize_and_export(col, "pirelli_pole_award.glb")


# ---------------------------------------------------------------------------
# 4. DHL FASTEST LAP AWARD
# ---------------------------------------------------------------------------
def build_dhl_fastest_lap_award():
    col = ensure_collection("Trophy_DHL_FL")
    mat_base = make_material("DHL_Dark_Prism", hex_to_linear("#161a24"), metallic=0.35, roughness=0.26)
    mat_chrome = make_material("DHL_Mirror_Chrome", hex_to_linear("#f1f5f9"), metallic=0.98, roughness=0.09)
    mat_dhl_red = make_material("DHL_Crimson_Red", hex_to_linear("#d40511"), metallic=0.42, roughness=0.20, coat_weight=0.6)
    mat_dhl_yellow = make_material("DHL_Speed_Yellow", hex_to_linear("#ffcc00"), metallic=0.55, roughness=0.18, coat_weight=0.5)

    add_box("DHL_Base_Lower", 0.155, 0.105, 0.032, loc=(0, 0, 0.016), bevel=0.005, material=mat_base, col=col)
    add_box("DHL_Base_Step", 0.125, 0.080, 0.022, loc=(0, 0, 0.043), bevel=0.004, material=mat_chrome, col=col)

    # Three sweeping speed blades rising dynamically toward upper-right
    ribbons = [
        ("DHL_Blade_Chrome", mat_chrome, -0.024, 0.000, 0.275, 0.006, 0.022),
        ("DHL_Blade_Red", mat_dhl_red, 0.004, -0.008, 0.255, 0.005, 0.018),
        ("DHL_Blade_Yellow", mat_dhl_yellow, 0.026, 0.006, 0.220, 0.005, 0.016),
    ]
    for r_name, mat, ox, oy, h, ru, rv in ribbons:
        pts = []
        for k in range(32):
            t = k / 31.0
            z = 0.050 + t * h
            x = ox + 0.048 * math.sin(t * 1.15 * math.pi) - t * 0.015
            y = oy + 0.018 * math.sin(t * 1.6 * math.pi)
            pts.append((x, y, z))
        create_ribbon_tube(r_name, pts, ru, rv, 10, mat, col)

    return normalize_and_export(col, "dhl_fastest_lap_award.glb")


# ---------------------------------------------------------------------------
# 5–8. 4 ICONIC GP TROPHIES (GP_Metal_Primary material tintable Gold/Silver/Bronze)
# ---------------------------------------------------------------------------
def build_gp_materials():
    m_primary = make_material("GP_Metal_Primary", hex_to_linear("#f5c542"), metallic=0.95, roughness=0.15)
    m_accent = make_material("GP_Metal_Accent", hex_to_linear("#e5ebf2"), metallic=0.92, roughness=0.18)
    m_base = make_material("GP_Base_Dark", hex_to_linear("#141821"), metallic=0.22, roughness=0.28)
    return m_primary, m_accent, m_base


def build_gp_classic():
    col = ensure_collection("Trophy_GP_Classic")
    m_prim, m_acc, m_base = build_gp_materials()

    create_lathe_mesh("GP1_Base", [
        (0.0, 0.0), (0.088, 0.0), (0.088, 0.022), (0.078, 0.032), (0.074, 0.072), (0.056, 0.084), (0.0, 0.084)
    ], 48, m_base, col)
    create_lathe_mesh("GP1_Collar", [(0.054, 0.082), (0.062, 0.088), (0.052, 0.096), (0.032, 0.098)], 48, m_acc, col)

    # Fluted royal chalice body
    cup_prof = [
        (0.0, 0.096), (0.032, 0.096), (0.024, 0.145), (0.038, 0.175),
        (0.072, 0.225), (0.092, 0.295), (0.096, 0.345), (0.105, 0.362),
        (0.095, 0.368), (0.082, 0.345), (0.064, 0.265), (0.0, 0.235),
    ]
    create_lathe_mesh("GP1_Cup", cup_prof, 48, m_prim, col, angle_deg=50.0)

    # Twin sculpted S-handles
    for side in (-1.0, 1.0):
        pts = [
            (side * 0.035, 0.155, 0.0),
            (side * 0.105, 0.185, 0.0),
            (side * 0.135, 0.265, 0.0),
            (side * 0.125, 0.335, 0.0),
            (side * 0.096, 0.342, 0.0),
        ]
        pts_3d = [(x, 0.0, z) for (x, z, _) in pts]
        create_ribbon_tube(f"GP1_Handle_{'L' if side < 0 else 'R'}", pts_3d, 0.0055, 0.009, 10, m_acc, col)

    return normalize_and_export(col, "gp_trophy_classic.glb")


def build_gp_monaco():
    col = ensure_collection("Trophy_GP_Monaco")
    m_prim, m_acc, m_base = build_gp_materials()

    add_box("GP2_Base_1", 0.19, 0.13, 0.032, loc=(0, 0, 0.016), bevel=0.005, material=m_base, col=col)
    add_box("GP2_Base_2", 0.155, 0.10, 0.036, loc=(0, 0, 0.050), bevel=0.004, material=m_base, col=col)

    # Architectural curved arch frame rising from plinth
    arch_pts = []
    for k in range(36):
        t = k / 35.0
        ang = math.pi * (1.0 - t)
        x = math.cos(ang) * 0.068
        z = 0.066 + 0.125 * math.sin(ang) + (0.08 * math.sin(ang))
        arch_pts.append((x, 0.0, z))
    create_ribbon_tube("GP2_Arch", arch_pts, 0.012, 0.016, 10, m_prim, col)

    # Inner faceted crystal/metal spire + horizontal ring
    spire = [(0.0, 0.068), (0.028, 0.068), (0.022, 0.19), (0.006, 0.32), (0.0, 0.335)]
    create_lathe_mesh("GP2_Spire", spire, 6, m_acc, col, angle_deg=24.0)
    create_lathe_mesh("GP2_Halo", [(0.044, 0.21), (0.054, 0.21), (0.054, 0.222), (0.044, 0.222)], 48, m_prim, col)

    return normalize_and_export(col, "gp_trophy_monaco.glb")


def build_gp_modern():
    col = ensure_collection("Trophy_GP_Modern")
    m_prim, m_acc, m_base = build_gp_materials()

    create_lathe_mesh("GP3_Base", [
        (0.0, 0.0), (0.084, 0.0), (0.084, 0.024), (0.072, 0.068), (0.054, 0.082), (0.0, 0.082)
    ], 48, m_base, col)

    # Three intertwined twisted aerodynamic ribbons rising to sculptural apex
    for idx in range(3):
        phase = idx * (math.tau / 3.0)
        pts = []
        for k in range(38):
            t = k / 37.0
            z = 0.080 + t * 0.295
            ang = phase + t * 1.45 * math.pi
            r = 0.048 * (1.0 - 0.52 * t) + 0.018 * math.sin(t * math.pi)
            pts.append((math.cos(ang) * r, math.sin(ang) * r, z))
        create_ribbon_tube(
            f"GP3_Spiral_{idx}", pts,
            0.006, 0.014, 10,
            m_prim if idx < 2 else m_acc, col,
        )

    # Floating ring crown near top
    bpy.ops.mesh.primitive_torus_add(
        major_segments=48, minor_segments=12,
        major_radius=0.042, minor_radius=0.0055,
        location=(0, 0, 0.325), rotation=Euler((math.radians(18), math.radians(-14), 0)),
    )
    ring = bpy.context.active_object
    ring.name = "GP3_Crown_Ring"
    ring.data.materials.append(m_prim)
    link_obj(ring, col)
    set_smooth_with_edges(ring, 60.0)

    return normalize_and_export(col, "gp_trophy_modern.glb")


def build_gp_chalice():
    col = ensure_collection("Trophy_GP_Chalice")
    m_prim, m_acc, m_base = build_gp_materials()

    create_lathe_mesh("GP4_Base", [
        (0.0, 0.0), (0.090, 0.0), (0.090, 0.022), (0.078, 0.056), (0.052, 0.072), (0.0, 0.072)
    ], 48, m_base, col)

    # Ringed architectural stem
    create_lathe_mesh("GP4_Stem_Rings", [
        (0.0, 0.072), (0.046, 0.072), (0.026, 0.098), (0.042, 0.112),
        (0.024, 0.128), (0.040, 0.142), (0.026, 0.158), (0.0, 0.158)
    ], 48, m_acc, col, angle_deg=38.0)

    # Wide flared modern goblet bowl
    bowl = [
        (0.0, 0.158), (0.028, 0.158), (0.056, 0.195), (0.088, 0.255),
        (0.106, 0.328), (0.112, 0.352), (0.100, 0.356), (0.078, 0.275),
        (0.042, 0.215), (0.0, 0.205),
    ]
    create_lathe_mesh("GP4_Bowl", bowl, 48, m_prim, col, angle_deg=50.0)

    return normalize_and_export(col, "gp_trophy_chalice.glb")


# ---------------------------------------------------------------------------
# SHOWCASE STUDIO PREVIEW RENDER
# ---------------------------------------------------------------------------
def render_preview(groups):
    os.makedirs(os.path.dirname(PREVIEW_PATH), exist_ok=True)
    # Offset each trophy group side by side along X
    spacing = 0.36
    start_x = -0.5 * (len(groups) - 1) * spacing
    for idx, objs in enumerate(groups):
        dx = start_x + idx * spacing
        for o in objs:
            o.location.x += dx

    # Bright studio plinth & backdrop
    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0, 0, -0.001))
    floor = bpy.context.active_object
    floor.data.materials.append(make_material("Studio_Floor", (0.78, 0.80, 0.84), metallic=0.05, roughness=0.25))

    bpy.ops.mesh.primitive_plane_add(size=14.0, location=(0, 2.2, 1.5), rotation=(math.radians(90), 0, 0))
    wall = bpy.context.active_object
    wall.data.materials.append(make_material("Studio_Wall", (0.90, 0.91, 0.93), metallic=0.0, roughness=0.6))

    # Lights
    world = bpy.data.worlds.new("MuseumPreviewWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.86, 0.88, 0.92, 1.0)
        bg.inputs["Strength"].default_value = 1.2

    for loc, energy, size in [
        ((0.0, -2.6, 2.6), 140.0, 3.0),
        ((-2.2, -1.8, 1.8), 90.0, 2.0),
        ((2.2, -1.8, 1.8), 90.0, 2.0),
    ]:
        ldata = bpy.data.lights.new("Area", type="AREA")
        ldata.energy = energy
        ldata.size = size
        lobj = bpy.data.objects.new("Light", ldata)
        lobj.location = loc
        direction = Vector((0, 0, 0.25)) - Vector(loc)
        lobj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.collection.objects.link(lobj)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 45.0
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    cam_obj.location = (0.0, -3.65, 0.72)
    direction = Vector((0.0, 0.0, 0.30)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 540
    scene.render.filepath = PREVIEW_PATH
    bpy.ops.render.render(write_still=True)
    print(f"[PREVIEW] Rendered studio showcase to {PREVIEW_PATH}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    clear_scene()
    groups = [
        build_fia_wdc_trophy(),
        build_fia_wcc_trophy(),
        build_pirelli_pole_award(),
        build_dhl_fastest_lap_award(),
        build_gp_classic(),
        build_gp_monaco(),
        build_gp_modern(),
        build_gp_chalice(),
    ]
    render_preview(groups)


if __name__ == "__main__":
    main()
