import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix
from trimesh.visual.material import PBRMaterial
from trimesh.scene.scene import Scene

import os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models', 'bishop.glb')

# ---------- materials ----------
def mat(name, rgba, metallic=0.28, roughness=0.45, emissive=None):
    return PBRMaterial(
        name=name,
        baseColorFactor=np.array(rgba, dtype=np.uint8),
        metallicFactor=float(metallic),
        roughnessFactor=float(roughness),
        emissiveFactor=np.array(emissive if emissive is not None else [0,0,0], dtype=np.float32),
    )

PEARL = mat('Pearl White', [238, 236, 226, 255], 0.28, 0.43)
SILVER = mat('Silver Grey', [132, 140, 148, 255], 0.30, 0.42)
GOLD = mat('Champagne Gold', [214, 168, 62, 255], 0.36, 0.38)
HOLY_GOLD = mat('Holy Gold Emissive', [255, 194, 74, 255], 0.22, 0.32, [1.0, 0.50, 0.05])
DARK = mat('Shadowed Face', [7, 15, 34, 255], 0.08, 0.55)
FOOT = mat('Dark Feet', [32, 34, 40, 255], 0.18, 0.50)


def apply_material(mesh, material):
    mesh.visual.material = material
    return mesh


def rot_z_to_y(mesh):
    # Blender/GLTF-friendly Y-up: primitive's local +Z becomes world +Y
    mesh.apply_transform(rotation_matrix(-np.pi/2, [1,0,0]))
    return mesh


def add_mesh(scene, mesh, name, pos=(0,0,0), material=None, rotation=None):
    if rotation is not None:
        mesh.apply_transform(rotation)
    mesh.apply_translation(np.array(pos, dtype=float))
    if material is not None:
        apply_material(mesh, material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    return mesh


def cylinder(name, radius, height, pos, material, sections=8, rot=None):
    m = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    rot_z_to_y(m)
    return add_mesh(SCENE, m, name, pos, material, rot)


def cone(name, radius, height, pos, material, sections=8, rot=None):
    m = trimesh.creation.cone(radius=radius, height=height, sections=sections)
    rot_z_to_y(m)
    return add_mesh(SCENE, m, name, pos, material, rot)


def box(name, extents, pos, material):
    m = trimesh.creation.box(extents=extents)
    return add_mesh(SCENE, m, name, pos, material)


def ico(name, radius, pos, material, subdivisions=1, rot=None):
    m = trimesh.creation.icosphere(subdivisions=subdivisions, radius=radius)
    return add_mesh(SCENE, m, name, pos, material, rot)


def frustum(name, r_bottom, r_top, height, pos, material, sections=8):
    # Custom Y-axis frustum with caps, flat facets.
    verts=[]; faces=[]
    z0=-height/2; z1=height/2
    for i in range(sections):
        a=2*np.pi*i/sections
        verts.append([r_bottom*np.cos(a), z0, r_bottom*np.sin(a)])
    for i in range(sections):
        a=2*np.pi*i/sections
        verts.append([r_top*np.cos(a), z1, r_top*np.sin(a)])
    # side quads triangulated for visible facets
    for i in range(sections):
        j=(i+1)%sections
        faces.append([i,j,sections+j])
        faces.append([i,sections+j,sections+i])
    # bottom/top caps
    vb=len(verts); verts.append([0,z0,0])
    vt=len(verts); verts.append([0,z1,0])
    for i in range(sections):
        j=(i+1)%sections
        faces.append([vb,j,i])
        faces.append([vt,sections+i,sections+j])
    m=trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)
    if m.volume < 0: m.invert()  # faces do avesso: corrige o sentido
    return add_mesh(SCENE, m, name, pos, material)


def diamond(name, size, pos, material):
    # Octahedron-like diamond
    s=size
    verts=np.array([
        [0, s, 0], [s*0.72,0,0], [0,0,s*0.72], [-s*0.72,0,0], [0,0,-s*0.72], [0,-s,0]
    ])
    faces=np.array([
        [0,1,2],[0,2,3],[0,3,4],[0,4,1],
        [5,2,1],[5,3,2],[5,4,3],[5,1,4]
    ])
    m=trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    if m.volume < 0: m.invert()  # faces do avesso: corrige o sentido
    return add_mesh(SCENE, m, name, pos, material)

# ---------- scene ----------
SCENE=Scene()

# Feet + legs
box('Foot_L', (0.14,0.08,0.16), (-0.085,0.04,0), FOOT)
box('Foot_R', (0.14,0.08,0.16), (0.085,0.04,0), FOOT)
cylinder('Leg_L', 0.09, 0.16, (-0.085,0.16,0), PEARL, 8)
cylinder('Leg_R', 0.09, 0.16, (0.085,0.16,0), PEARL, 8)

# Robe / waist / chest
frustum('Robe_Lower', 0.245, 0.195, 0.22, (0,0.30,0), PEARL, 8)
cylinder('Belt_Sash', 0.25, 0.04, (0,0.435,0), GOLD, 16)
cylinder('Torso_Chest', 0.19, 0.18, (0,0.55,0), PEARL, 10)

# shoulders
ico('Shoulder_L', 0.09, (-0.20,0.615,0), SILVER, 1)
ico('Shoulder_R', 0.09, (0.20,0.615,0), SILVER, 1)

# Arms: faceted cylinders, angled slightly outward.
# local cylinder along Y, then rotate about Z.
left_rot = rotation_matrix(np.deg2rad(22), [0,0,1])
right_rot = rotation_matrix(np.deg2rad(-10), [0,0,1])
left_arm = cylinder('Arm_L_Bent', 0.06, 0.19, (-0.245,0.565,0.02), PEARL, 8, left_rot)
right_arm = cylinder('Arm_R', 0.06, 0.19, (0.245,0.565,0.00), PEARL, 8, right_rot)

# Hands
ico('Hand_L', 0.055, (-0.30,0.50,0.08), PEARL, 1)
ico('Hand_R', 0.055, (0.29,0.49,0.00), PEARL, 1)

# Orb (left hand)
ico('Holy_Orb', 0.08, (-0.33,0.54,0.17), HOLY_GOLD, 2)

# Staff on right side, from floor to above hood
staff_rot=None
cylinder('Staff', 0.025, 0.98, (0.31,0.66,0.03), SILVER, 10)
ico('Staff_Gem', 0.07, (0.31,1.19,0.03), GOLD, 1)

# neck and head
cylinder('Neck', 0.075, 0.05, (0,0.705,0), SILVER, 8)
ico('Head', 0.26, (0,0.92,0), PEARL, 2)

# Hood: lower rounded-ish dome + pointed tip
# Use low-poly cone for the outer mitre; slight overlap with head.
cone('Hood', 0.305, 0.48, (0,1.02,-0.005), PEARL, 10)
cone('Hood_Tip', 0.11, 0.22, (0,1.37,-0.005), PEARL, 8)

# Face opening / visor, front = +Z.
box('Face_Opening', (0.40,0.15,0.035), (0,0.935,0.252), DARK)
# Add a small lower face rim for visual consistency.
frustum('Face_Lower_Rim', 0.205, 0.17, 0.055, (0,0.84,0.02), PEARL, 10)

# Pendant chain + diamond in front
cylinder('Pendant_Chain', 0.012, 0.10, (0,0.665,0.19), GOLD, 8)
diamond('Holy_Pendant', 0.065, (0,0.58,0.205), GOLD)

# Give scene a little metadata for downstream Three.js use
SCENE.metadata = {
    'asset_name': 'Chibi Bishop - White Team',
    'style': 'low-poly chibi dark fantasy',
    'units': 'scene units',
    'up_axis': 'Y',
    'approx_height': 1.52,
    'center_pivot': 'base of feet',
    'parts': ['legs','feet','robe','belt','torso','shoulders','arms','hands','orb','staff','staff_gem','neck','head','hood','hood_tip','face_opening','pendant_chain','pendant']
}

# Scene export. GLB embeds materials.
SCENE.export(OUT, file_type='glb')

# Validation by round-trip load.
loaded = trimesh.load(OUT, force='scene')
mins, maxs = loaded.bounds
print('EXPORTED', OUT)
print('GEOMETRIES', len(loaded.geometry))
print('BOUNDS', mins.tolist(), maxs.tolist())
print('HEIGHT', float(maxs[1]-mins[1]))
print('SIZE_BYTES', __import__('os').path.getsize(OUT))
