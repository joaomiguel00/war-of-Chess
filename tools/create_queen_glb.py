import os, math
import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix
from trimesh.visual.material import PBRMaterial
from trimesh.scene.scene import Scene

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models', 'queen.glb')

# ---------- materials ----------
def mat(name, rgba, metallic=0.30, roughness=0.43, emissive=None):
    return PBRMaterial(
        name=name,
        baseColorFactor=np.array(rgba, dtype=np.uint8),
        metallicFactor=float(metallic),
        roughnessFactor=float(roughness),
        emissiveFactor=np.array(emissive if emissive is not None else [0,0,0], dtype=np.float32),
    )

PEARL = mat('Pearl White', [238, 236, 226, 255], 0.28, 0.43)
SILVER = mat('Silver Grey', [138, 145, 153, 255], 0.30, 0.42)
GOLD = mat('Champagne Gold', [214, 168, 62, 255], 0.34, 0.38)
SILVER_TRIM = mat('Silver Trim', [175, 181, 188, 255], 0.32, 0.36)
DARK = mat('Shadowed Face', [7, 15, 34, 255], 0.08, 0.55)
FOOT = mat('Dark Feet', [31, 33, 39, 255], 0.18, 0.50)
HAIR = mat('Silver Blonde Hair', [187, 180, 155, 255], 0.20, 0.46)
SAPPHIRE = mat('Royal Sapphire Emissive', [38, 92, 190, 255], 0.22, 0.28, [0.03, 0.09, 0.30])

SCENE = Scene()

def apply_material(mesh, material):
    mesh.visual.material = material
    return mesh

def rot_z_to_y(mesh):
    # Primitive geometry uses +Z as its axis. Convert to Y-up.
    mesh.apply_transform(rotation_matrix(-math.pi/2, [1,0,0]))
    return mesh

def add_mesh(mesh, name, pos=(0,0,0), material=None, rotation=None):
    if rotation is not None:
        mesh.apply_transform(rotation)
    mesh.apply_translation(np.array(pos, dtype=float))
    if material is not None:
        apply_material(mesh, material)
    SCENE.add_geometry(mesh, node_name=name, geom_name=name)
    return mesh

def cylinder(name, radius, height, pos, material, sections=10, rot=None):
    m = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    rot_z_to_y(m)
    return add_mesh(m, name, pos, material, rot)

def cone(name, radius, height, pos, material, sections=8, rot=None):
    m = trimesh.creation.cone(radius=radius, height=height, sections=sections)
    rot_z_to_y(m)
    return add_mesh(m, name, pos, material, rot)

def box(name, extents, pos, material, rot=None):
    m = trimesh.creation.box(extents=extents)
    return add_mesh(m, name, pos, material, rot)

def ico(name, radius, pos, material, subdivisions=1, scale=None, rot=None):
    m = trimesh.creation.icosphere(subdivisions=subdivisions, radius=radius)
    if scale is not None:
        m.apply_scale(np.array(scale, dtype=float))
    return add_mesh(m, name, pos, material, rot)

def frustum(name, r_bottom, r_top, height, pos, material, sections=8):
    verts=[]; faces=[]
    y0=-height/2; y1=height/2
    for i in range(sections):
        a=2*math.pi*i/sections
        verts.append([r_bottom*math.cos(a), y0, r_bottom*math.sin(a)])
    for i in range(sections):
        a=2*math.pi*i/sections
        verts.append([r_top*math.cos(a), y1, r_top*math.sin(a)])
    for i in range(sections):
        j=(i+1)%sections
        faces.append([i,j,sections+j]); faces.append([i,sections+j,sections+i])
    vb=len(verts); verts.append([0,y0,0])
    vt=len(verts); verts.append([0,y1,0])
    for i in range(sections):
        j=(i+1)%sections
        faces.append([vb,j,i]); faces.append([vt,sections+i,sections+j])
    m=trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)
    if m.volume < 0: m.invert()  # faces do avesso: corrige o sentido
    return add_mesh(m, name, pos, material)

def diamond(name, size, pos, material):
    s=size
    verts=np.array([
        [0, s, 0], [s*0.72,0,0], [0,0,s*0.72], [-s*0.72,0,0], [0,0,-s*0.72], [0,-s,0]
    ])
    faces=np.array([[0,1,2],[0,2,3],[0,3,4],[0,4,1],[5,2,1],[5,3,2],[5,4,3],[5,1,4]])
    m=trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    if m.volume < 0: m.invert()  # faces do avesso: corrige o sentido
    return add_mesh(m, name, pos, material)

# ---------- queen geometry ----------
# Grounded feet: base pivot is at global Y=0.
box('Foot_L', (0.14, 0.08, 0.17), (-0.085, 0.04, 0.00), FOOT)
box('Foot_R', (0.14, 0.08, 0.17), (0.085, 0.04, 0.00), FOOT)

# Longer legs for queen height.
cylinder('Leg_L', 0.08, 0.20, (-0.085, 0.18, 0.00), PEARL, 8)
cylinder('Leg_R', 0.08, 0.20, (0.085, 0.18, 0.00), PEARL, 8)

# Elegant tall flowing gown: 0.28 -> 0.64.
frustum('Gown_Lower', 0.26, 0.20, 0.36, (0, 0.46, 0), PEARL, 8)
# Silver hem ring at the very bottom.
cylinder('Gown_Hem_Silver', 0.263, 0.025, (0, 0.292, 0), SILVER_TRIM, 16)

# Waist sash.
cylinder('Waist_Sash', 0.235, 0.035, (0, 0.652, 0), GOLD, 16)

# Bodice / torso.
cylinder('Torso_Bodice', 0.17, 0.20, (0, 0.775, 0), PEARL, 10)
# Subtle silver corset-line detail on front, matching the low-poly language.
box('Corset_Line_L', (0.018, 0.145, 0.018), (-0.065, 0.775, 0.166), SILVER_TRIM)
box('Corset_Line_R', (0.018, 0.145, 0.018), (0.065, 0.775, 0.166), SILVER_TRIM)

# Delicate shoulders.
ico('Shoulder_L', 0.08, (-0.185, 0.84, 0.00), SILVER, 1)
ico('Shoulder_R', 0.08, (0.185, 0.84, 0.00), SILVER, 1)

# Arms: left relaxed, right slightly raised/forward toward scepter.
left_rot = rotation_matrix(math.radians(8), [0,0,1])
right_rot = rotation_matrix(math.radians(-28), [0,0,1])
cylinder('Arm_L', 0.055, 0.21, (-0.225, 0.785, 0.01), PEARL, 8, left_rot)
cylinder('Arm_R', 0.055, 0.21, (0.225, 0.85, 0.035), PEARL, 8, right_rot)

# Small hands for continuity with the pawn/bishop style.
ico('Hand_L', 0.05, (-0.255, 0.685, 0.03), PEARL, 1)
ico('Hand_R', 0.05, (0.285, 0.98, 0.045), PEARL, 1)

# Scepter in right hand: 0.62 high, extends clearly above head.
cylinder('Scepter', 0.022, 0.62, (0.30, 1.37, 0.055), SILVER, 10)
ico('Scepter_Gem', 0.09, (0.30, 1.75, 0.055), SAPPHIRE, 1)
# Tiny gold collar below the gem for royal silhouette.
cylinder('Scepter_Collar', 0.036, 0.035, (0.30, 1.69, 0.055), GOLD, 10)

# Neck and head.
cylinder('Neck', 0.07, 0.05, (0, 0.91, 0), SILVER, 8)
ico('Head', 0.24, (0, 1.18, 0), PEARL, 2)

# Hair-base flowing behind the head/shoulders, deliberately faceted and non-organic.
ico('Hair_Base', 0.29, (0, 1.055, -0.15), HAIR, 1, scale=(1.0, 1.25, 0.72))
# Two small side locks.
ico('Hair_Lock_L', 0.08, (-0.21, 1.00, -0.055), HAIR, 1, scale=(0.72, 1.65, 0.70))
ico('Hair_Lock_R', 0.08, (0.21, 1.00, -0.055), HAIR, 1, scale=(0.72, 1.65, 0.70))

# Face opening, thinner than the bishop's.
box('Face_Opening', (0.335, 0.092, 0.035), (0, 1.185, 0.232), DARK)

# Crown: 7 faceted spikes on a ring, immediately readable as queen.
crown_radius = 0.125
crown_y = 1.435
for i in range(7):
    a = 2*math.pi*i/7 + math.pi/2
    x = crown_radius*math.cos(a)
    z = crown_radius*math.sin(a)
    cone(f'Crown_Spike_{i+1}', 0.03, 0.09, (x, crown_y, z), GOLD, 6)
# Crown ring itself.
cylinder('Crown_Ring', 0.145, 0.025, (0, 1.405, 0), GOLD, 12)

# Royal pendant: thin chain + sapphire diamond.
cylinder('Pendant_Chain', 0.010, 0.105, (0, 0.875, 0.165), GOLD, 8)
diamond('Royal_Pendant', 0.055, (0, 0.80, 0.178), SAPPHIRE)

SCENE.metadata = {
    'asset_name': 'Chibi Queen - White Team',
    'style': 'low-poly chibi dark fantasy',
    'units': 'scene units',
    'up_axis': 'Y',
    'approx_height': 1.84,
    'center_pivot': 'base of feet',
    'animation_parts': ['Foot_L','Foot_R','Leg_L','Leg_R','Gown_Lower','Waist_Sash','Torso_Bodice','Shoulder_L','Shoulder_R','Arm_L','Arm_R','Hand_L','Hand_R','Scepter','Scepter_Gem','Neck','Head'],
}

SCENE.export(OUT, file_type='glb')

# Round-trip validation.
loaded = trimesh.load(OUT, force='scene')
mins, maxs = loaded.bounds
names = list(loaded.geometry.keys())
print('EXPORTED', OUT)
print('GEOMETRIES', len(names))
print('NAMES', names)
print('BOUNDS', mins.tolist(), maxs.tolist())
print('HEIGHT', float(maxs[1]-mins[1]))
print('SIZE_BYTES', os.path.getsize(OUT))
