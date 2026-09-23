import os, math
import trimesh, numpy as np
from trimesh.transformations import rotation_matrix
from trimesh.creation import cylinder, box, icosphere

# Versão corrigida do create_king_glb.py original. Mesmas peças, posições,
# medidas e materiais; correções:
# - cilindros do trimesh nascem no eixo Z: agora ficam em pé (Y);
# - trimesh.creation.cone ignora r2: cone_part virou tronco de cone centrado;
# - a barba aponta para baixo (estreita embaixo);
# - a capa era duas placas soltas: virou um prisma fechado;
# - saída em public/models/king.glb.
# O rei olha para -Z (frente); o jogo gira o modelo para a frente +Z.

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models', 'king.glb')

scene = trimesh.Scene()

def mat(name, color, metallic=.3, rough=.42, emissive=None):
    return trimesh.visual.material.PBRMaterial(
        name=name, baseColorFactor=(*color,255), metallicFactor=metallic,
        roughnessFactor=rough, emissiveFactor=emissive if emissive else (0,0,0))

PEARL=mat('Pearl White',(0.88,0.86,0.80),.28,.42)
SILVER=mat('Silver',(0.48,0.50,0.52),.32,.38)
GOLD=mat('Royal Gold',(0.82,0.55,0.08),.35,.36)
SAPPHIRE=mat('Sapphire Cape',(0.035,0.07,0.28),.28,.40)
NAVY=mat('Dark Navy',(0.015,0.025,0.09),.05,.5)
DARK=mat('Dark Feet',(0.035,0.035,0.045),.15,.48)
RED=mat('Crown Gem',(0.65,0.03,0.04),.28,.3,emissive=(0.12,0.0,0.0))
ORB=mat('Golden Orb',(1.0,0.52,0.04),.25,.32,emissive=(0.55,0.20,0.01))

parts=[]
def add(name, mesh, material, loc=None, rot=None):
    mesh=mesh.copy(); mesh.visual.material=material
    if loc is not None: mesh.apply_translation(loc)
    if rot is not None: mesh.apply_transform(rot)
    scene.add_geometry(mesh, geom_name=name, node_name=name)
    parts.append(name)
    return mesh

def cyl(name,r,h,loc,material,sections=8, axis='y'):
    m=cylinder(r,h,sections=sections)  # nasce no eixo Z
    if axis=='y': m.apply_transform(rotation_matrix(-math.pi/2,[1,0,0]))
    elif axis=='x': m.apply_transform(rotation_matrix(math.pi/2,[0,1,0]))
    return add(name,m,material,loc)

def frustum_mesh(r_bottom, r_top, height, sections=8):
    # Tronco de cone em Y, centrado na origem, com tampas.
    verts=[]; faces=[]
    y0=-height/2; y1=height/2
    for i in range(sections):
        a=2*math.pi*i/sections; verts.append([r_bottom*math.cos(a), y0, r_bottom*math.sin(a)])
    for i in range(sections):
        a=2*math.pi*i/sections; verts.append([r_top*math.cos(a), y1, r_top*math.sin(a)])
    for i in range(sections):
        j=(i+1)%sections
        faces.append([i,j,sections+j]); faces.append([i,sections+j,sections+i])
    vb=len(verts); verts.append([0,y0,0]); vt=len(verts); verts.append([0,y1,0])
    for i in range(sections):
        j=(i+1)%sections
        faces.append([vb,j,i]); faces.append([vt,sections+i,sections+j])
    m=trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)
    if m.volume < 0: m.invert()
    return m

def cone_part(name,r1,r2,h,loc,material,sections=8):
    # r1 = raio de baixo, r2 = raio de cima, centrado em loc.
    return add(name,frustum_mesh(r1,r2,h,sections),material,loc)

def prism(name, outline, z0, z1, material):
    # Polígono convexo (x, y) extrudado entre z0 e z1, fechado.
    n=len(outline)
    verts=[[x,y,z0] for x,y in outline]+[[x,y,z1] for x,y in outline]
    cx=sum(p[0] for p in outline)/n; cy=sum(p[1] for p in outline)/n
    c0=len(verts); verts.append([cx,cy,z0]); c1=len(verts); verts.append([cx,cy,z1])
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces += [[c0,j,i],[c1,n+i,n+j],[i,j,n+j],[i,n+j,n+i]]
    m=trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)
    if m.volume < 0: m.invert()
    return add(name,m,material)

def sph(name,r,loc,material,sub=1): return add(name,icosphere(subdivisions=sub,radius=r),material,loc)
def bx(name,ext,loc,material): return add(name,box(extents=ext),material,loc)

# Feet and legs: base sits at y=0
bx('Foot_L',(0.16,0.10,0.20),(-0.105,0.05,0),DARK)
bx('Foot_R',(0.16,0.10,0.20),(0.105,0.05,0),DARK)
cyl('Leg_L',.09,.20,(-.105,.20,0),PEARL)
cyl('Leg_R',.09,.20,(.105,.20,0),PEARL)
# silver greaves
cone_part('Greave_L',.075,.085,.13,(-.105,.20,0),SILVER,6)
cone_part('Greave_R',.075,.085,.13,(.105,.20,0),SILVER,6)

# Long robe y 0.61, height .42
cone_part('Robe_Lower',.30,.22,.42,(0,.61,0),PEARL,10)
cyl('Robe_Hem',.305,.035,(0,.405,0),SILVER,10)
# gold vertical trim lines front (negative z)
for i,x in enumerate([-.15,-.075,0,.075,.15],1):
    bx(f'Robe_Trim_{i}',(.012,.30,.012),(x,.60,-.225),GOLD)

# belt and torso
cyl('Waist_Belt',.26,.05,(0,.845,0),GOLD,12)
cyl('Torso',.22,.22,(0,.985,0),PEARL,10)
# ornate chest emblem components
bx('Breastplate_Diamond',(.11,.13,.025),(0,1.01,-.225),GOLD)
bx('Breastplate_Cross_V',(.035,.12,.025),(0,1.01,-.245),GOLD)
bx('Breastplate_Cross_H',(.11,.035,.025),(0,1.01,-.245),GOLD)

# cape angular back, from shoulders down near ground (mesmo contorno do original)
cape_outline=[(-.29,.98),(.29,.98),(.42,.85),(.38,.25),(.28,.08),(-.28,.08),(-.38,.25),(-.42,.85)]
prism('Cape',cape_outline,.10,.16,SAPPHIRE)
# gold cape edge strips
bx('Cape_Edge_L',(.025,.88,.025),(-.40,.56,.14),GOLD)
bx('Cape_Edge_R',(.025,.88,.025),(.40,.56,.14),GOLD)

# shoulders and arms
sph('Shoulder_L',.10,(-.28,1.08,0),GOLD,1)
sph('Shoulder_R',.10,(.28,1.08,0),GOLD,1)
cyl('Arm_L',.07,.22,(-.34,.94,0),PEARL,8)
cyl('Arm_R',.07,.22,(.34,.94,0),PEARL,8)
# wrist cuffs
cyl('Cuff_L',.075,.035,(-.34,.83,0),GOLD,8)
cyl('Cuff_R',.075,.035,(.34,.83,0),GOLD,8)

# sword, point-down on right/front (negative z), vertical
bx('Sword_Blade',(.055,.58,.018),(.39,.48,-.05),SILVER)
bx('Sword_Guard',(.20,.035,.045),(.39,.76,-.05),GOLD)
cyl('Sword_Grip',.025,.15,(.39,.845,-.05),DARK,8)
sph('Sword_Pommel',.045,(.39,.93,-.05),GOLD,1)

# orb left hand + cross
sph('Golden_Orb',.10,(-.39,.84,-.02),ORB,1)
bx('Orb_Cross_V',(.025,.12,.025),(-.39,.97,-.02),GOLD)
bx('Orb_Cross_H',(.09,.025,.025),(-.39,1.00,-.02),GOLD)

# neck
cyl('Neck',.08,.06,(0,1.13,0),GOLD,8)
# head
sph('Head',.27,(0,1.39,0),PEARL,2)
# beard: low-poly wedge pointing down/front (largo em cima, estreito embaixo)
cone_part('Beard',.055,.16,.25,(0,1.19,-.10),PEARL,6)
# face opening
bx('Face_Opening',(.38,.075,.025),(0,1.39,-.255),NAVY)

# crown ring, spikes, beads, gem
cyl('Crown_Ring',.16,.055,(0,1.65,0),GOLD,12)
for i in range(5):
    a=2*math.pi*i/5 + math.pi/2
    x=.16*math.cos(a); z=.16*math.sin(a)
    cone_part(f'Crown_Spike_{i+1}',.045,.008,.13,(x,1.74,z),GOLD,5)
for i in range(4):
    a=2*math.pi*i/4 + math.pi/4
    sph(f'Crown_Bead_{i+1}',.025,(.16*math.cos(a),1.69,.16*math.sin(a)),GOLD,1)
sph('Crown_Gem',.055,(0,1.67,-.17),RED,1)

# medallion chain and pendant
for i,x in enumerate([-.12,-.06,0,.06,.12],1):
    y=1.08 + 0.035*abs(x/.12)
    sph(f'Chain_Bead_{i}',.018,(x,y,-.235),GOLD,1)
bx('Chest_Medallion',(.13,.16,.035),(0,.99,-.26),GOLD)

# Altura final ~2.08: topo da coroa em 1.805, escala uniforme a partir do chão.
scale=2.08/1.805
for name in list(scene.geometry.keys()):
    scene.geometry[name].apply_scale(scale)

scene.export(OUT)
loaded = trimesh.load(OUT, force='scene')
mins, maxs = loaded.bounds
print('EXPORTED', OUT)
print('GEOMETRIES', len(loaded.geometry))
print('BOUNDS', mins.tolist(), maxs.tolist())
print('HEIGHT', float(maxs[1]-mins[1]))
