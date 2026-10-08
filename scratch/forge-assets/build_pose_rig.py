"""Add a bounded interactive pose rig without altering the verified static mesh.

The existing dunk is the bind pose. This is an interactive silhouette rig,
not a neutral-pose production animation topology or a motion-capture character.
Uses only NumPy and the standard library. All output files have new names.
"""
from pathlib import Path
import base64
import hashlib
import json
import math
import struct

import numpy as np

ROOT = Path(__file__).resolve().parent


def load_model(source_name='basketball-dunk-silhouette.glb'):
    data = (ROOT / source_name).read_bytes()
    assert struct.unpack_from('<4sII', data) == (b'glTF', 2, len(data))
    count = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+count])
    binary = data[28+count:]
    def read(index):
        a = doc['accessors'][index]
        v = doc['bufferViews'][a['bufferView']]
        dtype = {5126:'<f4', 5125:'<u4', 5123:'<u2'}[a['componentType']]
        width = {'VEC3':3, 'SCALAR':1}[a['type']]
        result = np.frombuffer(binary, dtype=dtype, count=a['count']*width,
                               offset=v.get('byteOffset',0)+a.get('byteOffset',0))
        return result.copy().reshape(-1,width) if width > 1 else result.copy()
    primitive = doc['meshes'][0]['primitives'][0]
    positions = read(primitive['attributes']['POSITION'])
    normals = read(primitive['attributes']['NORMAL'])
    faces = read(primitive['indices']).reshape(-1,3)
    parts = doc['meshes'][0]['extras']['parts']
    return data, doc, positions, normals, faces, parts


def frame(direction, normal=(0,0,1)):
    """Hinge, lengthwise twist, sideways axes in the original bind frame."""
    y = np.asarray(direction,dtype=float); y /= np.linalg.norm(y)
    x = np.asarray(normal,dtype=float); x -= y*np.dot(x,y)
    if np.linalg.norm(x) < .01:
        x = np.array([1.,0.,0.]); x -= y*np.dot(x,y)
    x /= np.linalg.norm(x)
    z = np.cross(x,y); z /= np.linalg.norm(z)
    return [x.tolist(), y.tolist(), z.tolist()]


def skeleton(offset):
    bones, fields = [], []
    def add(name,label,parent,pivot,points,limits,axes=None,translation=None):
        bone = {'name':name,'label':label,'parent':parent,
                'pivot':[pivot[0],pivot[1]-offset,pivot[2]],
                'axes':axes or np.eye(3).tolist(), 'limits':limits}
        if translation is not None:
            bone['translationLimits'] = translation
        bones.append(bone)
        fields.append([(x,y-offset,z,r) for x,y,z,r in points])
    wide = [[-180,180]]*3
    add('root','Whole model',-1,(0,offset,0),[],wide,translation=[[-1.5,1.5]]*3)
    add('pelvis','Pelvis',0,(0,.995,-.024),[(0,.945,-.024,.164),(0,1.07,.01,.164)],
        [[-10,10],[-15,15],[-10,10]])
    add('spine','Lower torso',1,(0,1.055,.006),[(0,1.055,.006,.169),(-.017,1.31,.076,.182)],
        [[-10,10],[-15,15],[-10,10]])
    add('chest','Chest',2,(-.017,1.31,.076),[(-.017,1.30,.076,.185),(-.027,1.59,.066,.178)],
        [[-10,10],[-15,15],[-10,10]])
    add('neck','Neck',3,(-.027,1.610,.080),[(-.027,1.604,.081,.046),(-.026,1.704,.095,.047)],
        [[-12,12],[-15,15],[-12,12]])
    add('head','Head',4,(-.026,1.700,.095),[(-.026,1.68,.128,.057),(-.026,1.763,.095,.086),(-.026,1.87,.078,.060)],
        [[-25,25],[-40,40],[-20,20]])
    rshoulder=(-.204,1.557,.062); relbow=(-.469,1.705,-.054); rwrist=(-.516,1.916,-.071)
    lshoulder=(.193,1.526,.062); lelbow=(.240,1.226,.103); lwrist=(.324,1.030,.235)
    add('right_shoulder','Raised arm · shoulder',3,rshoulder,
        [(*rshoulder,.067),(-.351,1.641,-.016,.060),(*relbow,.043)],
        [[-20,20],[-20,20],[-20,20]],frame(np.subtract(relbow,rshoulder)))
    hinge=np.cross(np.subtract(relbow,rshoulder),np.subtract(rwrist,relbow))
    add('right_elbow','Raised arm · elbow',6,relbow,
        [(*relbow,.041),(-.484,1.758,-.065,.046),(-.508,1.873,-.073,.032),(*rwrist,.025)],
        [[-25,35],[-15,15],[-5,5]],frame(np.subtract(rwrist,relbow),hinge))
    add('right_wrist','Raised hand · wrist',7,rwrist,
        [(*rwrist,.025),(-.531,1.977,-.067,.032),(-.530,2.010,-.065,.024)],
        [[-20,20],[-25,25],[-18,18]],frame((-.014,.094,.006)))
    add('left_shoulder','Free arm · shoulder',3,lshoulder,
        [(*lshoulder,.067),(.230,1.356,.074,.056),(*lelbow,.042)],
        [[-20,20],[-20,20],[-20,20]],frame(np.subtract(lelbow,lshoulder)))
    hinge=np.cross(np.subtract(lelbow,lshoulder),np.subtract(lwrist,lelbow))
    add('left_elbow','Free arm · elbow',9,lelbow,
        [(*lelbow,.042),(.279,1.142,.163,.045),(*lwrist,.024)],
        [[-15,35],[-15,15],[-5,5]],frame(np.subtract(lwrist,lelbow),hinge))
    add('left_wrist','Free hand · wrist',10,lwrist,
        [(*lwrist,.024),(.332,.992,.256,.030),(.337,.961,.274,.027)],
        [[-25,25],[-30,30],[-20,20]],frame((.013,-.069,.039)))
    rhip=(-.100,.995,-.049); rknee=(-.132,.575,-.190); rankle=(-.135,.778,-.605)
    lhip=(.094,.995,.034); lknee=(.154,.737,.393); lankle=(.150,.269,.255)
    add('right_hip','Trailing leg · hip',1,rhip,
        [(*rhip,.110),(-.111,.886,-.078,.120),(-.128,.664,-.159,.105),(*rknee,.053)],
        [[-20,20],[-15,15],[-15,15]],frame(np.subtract(rknee,rhip),(1,0,0)))
    hinge=np.cross(np.subtract(rknee,rhip),np.subtract(rankle,rknee))
    add('right_knee','Trailing leg · knee',12,rknee,
        [(*rknee,.052),(-.133,.646,-.327,.064),(-.135,.737,-.518,.038),(*rankle,.029)],
        [[-20,25],[-5,5],[-5,5]],frame(np.subtract(rankle,rknee),hinge))
    add('right_ankle','Trailing foot',13,rankle,
        [(-.135,.765,-.575,.040),(-.135,.826,-.655,.064),(-.135,.784,-.915,.048)],
        [[-12,12],[-15,15],[-8,8]],frame((0,.006,-.310),(1,0,0)))
    add('left_hip','Forward leg · hip',1,lhip,
        [(*lhip,.113),(.105,.944,.104,.120),(.136,.806,.311,.108),(*lknee,.060)],
        [[-20,20],[-15,15],[-15,15]],frame(np.subtract(lknee,lhip),(1,0,0)))
    hinge=np.cross(np.subtract(lknee,lhip),np.subtract(lankle,lknee))
    add('left_knee','Forward leg · knee',15,lknee,
        [(*lknee,.058),(.152,.602,.363,.066),(.149,.408,.301,.044),(*lankle,.032)],
        [[-25,25],[-5,5],[-5,5]],frame(np.subtract(lankle,lknee),hinge))
    add('left_ankle','Forward foot',16,lankle,
        [(.150,.324,.275,.041),(.150,.217,.238,.064),(.158,.060,.426,.052)],
        [[-12,12],[-15,15],[-8,8]],frame((.008,-.209,.171),(1,0,0)))
    ball=np.array([-.413,2.010,-.064]); radius=.119
    labels=['Index finger','Middle finger','Ring finger','Little finger']
    for i in range(4):
        z=ball[2]+(i-1.5)*.019
        rad=math.sqrt(radius**2-(z-ball[2])**2)+.004
        controls=[(ball[0]+rad*math.cos(a),ball[1]+rad*math.sin(a),z,r)
                  for a,r in zip(np.linspace(3.17,(1.97,1.84,1.94,2.10)[i],5),(.010,.009,.008,.006,.004))]
        add(f'right_finger_{i+1}',f'Raised hand · {labels[i]}',8,controls[0][:3],controls,
            [[-12,12],[-8,8],[-10,10]],frame(np.subtract(controls[-1][:3],controls[0][:3]),(0,0,1)))
    controls=[(-.522,1.953,-.046,.012),(-.497,1.918,-.013,.011),(-.458,1.901,-.015,.008),(-.437,1.902,-.018,.004)]
    add('right_thumb','Raised hand · Thumb',8,controls[0][:3],controls,[[-12,12],[-10,10],[-10,10]],
        frame(np.subtract(controls[-1][:3],controls[0][:3]),(0,0,1)))
    for i,(length,spread) in enumerate(((.078,-.014),(.094,-.004),(.088,.008),(.068,.025))):
        x=.306+i*.018;z=.278+i*.005
        controls=[(x,.968,z,.010),(x+spread*.5,.936,z+.013,.009),
                  (x+spread,.974-length,z+.027,.0065),(x+spread,.967-length,z+.030,.004)]
        add(f'left_finger_{i+1}',f'Free hand · {labels[i]}',11,controls[0][:3],controls,
            [[-25,25],[-10,10],[-18,18]],frame(np.subtract(controls[-1][:3],controls[0][:3]),(1,0,0)))
    controls=[(.302,1.007,.255,.012),(.281,.992,.285,.011),(.262,.989,.315,.008),(.254,.9877,.328,.004)]
    add('left_thumb','Free hand · Thumb',11,controls[0][:3],controls,[[-25,25],[-15,15],[-20,20]],
        frame(np.subtract(controls[-1][:3],controls[0][:3]),(1,0,0)))
    add('basketball','Basketball',8,ball,[],wide,translation=[[-1.5,1.5]]*3)
    assert len(bones)==29
    return bones, fields


def field_score(points, controls):
    """Distance to the sculpt's varying-radius center line in radius units."""
    score=np.full(len(points),np.inf)
    for first,second in zip(controls,controls[1:]):
        a=np.array(first[:3]); b=np.array(second[:3]); line=b-a
        t=np.clip((points-a)@line/np.dot(line,line),0,1)
        closest=a+t[:,None]*line
        radius=first[3]+t*(second[3]-first[3])
        candidate=np.sum((points-closest)**2,axis=1)/(radius*radius)
        score=np.minimum(score,candidate)
    return score


def skin_weights(positions, faces, fields, body_count):
    # Continuous fields make shared union vertices deform together. Small fingers
    # are identified by their own thin center lines, not by nearby body surfaces.
    scores=np.column_stack([field_score(positions[:body_count],fields[i]) for i in range(1,28)])
    nearest=np.argpartition(scores,3,axis=1)[:,:4]
    chosen=np.take_along_axis(scores,nearest,axis=1)
    probability=np.exp(-(chosen-chosen.min(axis=1)[:,None])/.22)
    probability[probability<.002]=0
    probability/=probability.sum(axis=1)[:,None]
    joints=np.zeros((len(positions),4),dtype=np.uint8)
    weights=np.zeros((len(positions),4),dtype='<f4')
    joints[:body_count]=nearest+1
    weights[:body_count]=probability
    joints[body_count:,0]=28; weights[body_count:,0]=1
    return joints,weights


def export_rigged(doc,positions,normals,faces,joints,weights,bones,body_count,ball_pivot,
                  output_name='basketball-dunk-poseable.glb',bind_label='Original reference dunk'):
    chunks=[];views=[];accessors=[]
    def accessor(array,kind,component,target=None,bounds=False):
        array=np.ascontiguousarray(array)
        offset=sum(len(c) for c in chunks)
        raw=array.tobytes(); chunks.append(raw+b'\x00'*((-len(raw))%4))
        v={'buffer':0,'byteOffset':offset,'byteLength':len(raw)}
        if target is not None:v['target']=target
        views.append(v)
        a={'bufferView':len(views)-1,'componentType':component,'count':len(array),'type':kind}
        if bounds:a.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
        accessors.append(a);return len(accessors)-1
    body_faces=faces[np.max(faces,axis=1)<body_count]
    ball_faces=faces[np.min(faces,axis=1)>=body_count]-body_count
    attrs={'POSITION':accessor(positions[:body_count],'VEC3',5126,34962,True),
           'NORMAL':accessor(normals[:body_count],'VEC3',5126,34962),
           'JOINTS_0':accessor(joints[:body_count],'VEC4',5121,34962),
           'WEIGHTS_0':accessor(weights[:body_count],'VEC4',5126,34962)}
    body_indices=accessor(body_faces.ravel().astype('<u4'),'SCALAR',5125,34963)
    local_ball=(positions[body_count:].astype(float)-ball_pivot).astype('<f4')
    ball_attrs={'POSITION':accessor(local_ball,'VEC3',5126,34962,True),
                'NORMAL':accessor(normals[body_count:],'VEC3',5126,34962)}
    ball_indices=accessor(ball_faces.ravel().astype('<u2'),'SCALAR',5123,34963)
    inverse=np.repeat(np.eye(4)[None],28,axis=0)
    inverse[:,:3,3]=-np.array([b['pivot'] for b in bones[:28]])
    inverse_id=accessor(np.swapaxes(inverse,1,2).reshape(28,16).astype('<f4'),'MAT4',5126)
    # Node0 holds the skinned surface. Bone nodes1..28 preserve semantic names.
    nodes=[{'name':'poseable_player_body','mesh':0,'skin':0}]
    for b in bones[:28]:
        parent=b['parent']
        translation=np.array(b['pivot'])-(np.array(bones[parent]['pivot']) if parent>=0 else 0)
        nodes.append({'name':b['name'],'translation':translation.tolist(),'extras':{
            'poseAxes':b['axes'],'poseRotationLimitsDegrees':b['limits']}})
    for i,b in enumerate(bones[:28]):
        if b['parent']>=0:nodes[b['parent']+1].setdefault('children',[]).append(i+1)
    nodes.append({'name':'basketball','mesh':1,'translation':(ball_pivot-np.array(bones[8]['pivot'])).tolist()})
    nodes[9].setdefault('children',[]).append(len(nodes)-1)
    binary=b''.join(chunks)
    output={'asset':{'version':'2.0','generator':'DJHC silhouette interactive pose rig v1',
        'extras':{'bindPose':bind_label,'scope':'Interactive posing; no animation clips'}},
        'scene':0,'scenes':[{'name':'Poseable dunk silhouette','nodes':[0,1]}],
        'nodes':nodes,'meshes':[{'name':'unified_player_body','primitives':[{'attributes':attrs,
                    'indices':body_indices,'material':0,'mode':4}]},
                   {'name':'basketball','primitives':[{'attributes':ball_attrs,'indices':ball_indices,'material':0,'mode':4}]}],
        'skins':[{'name':'interactive_dunk_skeleton','skeleton':1,'joints':list(range(1,29)),
                  'inverseBindMatrices':inverse_id}],
        'materials':doc['materials'],'buffers':[{'byteLength':len(binary)}],
        'bufferViews':views,'accessors':accessors}
    encoded=json.dumps(output,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    length=12+8+len(encoded)+8+len(binary)
    data=struct.pack('<4sII',b'glTF',2,length)+struct.pack('<II',len(encoded),0x4E4F534A)+encoded
    data+=struct.pack('<II',len(binary),0x004E4942)+binary
    (ROOT/output_name).write_bytes(data)
    return data


def main():
    source,doc,positions,normals,faces,parts=load_model()
    body_count=parts[1]['firstVertex']
    ball_positions=positions[body_count:]
    ball_pivot=(ball_positions.min(axis=0).astype(float)+ball_positions.max(axis=0).astype(float))*.5
    offset=2.010-ball_pivot[1]
    bones,fields=skeleton(offset)
    bones[28]['pivot']=ball_pivot.tolist()
    joints,weights=skin_weights(positions,faces,fields,body_count)
    assert np.isfinite(weights).all() and (weights>=0).all()
    assert np.max(np.abs(weights.sum(axis=1)-1))<2e-7
    assert joints.max()==28 and not (joints[:body_count]==28).any()
    data=export_rigged(doc,positions,normals,faces,joints,weights,bones,body_count,ball_pivot)
    rig={'version':1,'vertexCount':len(positions),'sourceSha256':hashlib.sha256(source).hexdigest(),
         'riggedGlbSha256':hashlib.sha256(data).hexdigest(),'bones':bones,
         'jointsBase64':base64.b64encode(joints.tobytes()).decode(),
         'weightsBase64':base64.b64encode(weights.tobytes()).decode(),
         'ballIndex':28,'handIndex':8,'ballRange':{'firstVertex':body_count,'count':len(ball_positions)},
         'defaultPose':{'rotations':[[0,0,0] for _ in bones],'translations':[[0,0,0] for _ in bones],
                        'ballAttached':True}}
    (ROOT/'rig-data.js').write_text('globalThis.SILHOUETTE_RIG = '+json.dumps(rig,separators=(',',':'))+';\n',encoding='utf-8')
    report={'status':'passed','sourceGlbSha256':rig['sourceSha256'],'riggedGlbSha256':rig['riggedGlbSha256'],
            'vertexCount':len(positions),'triangleCount':len(faces),'jointControls':len(bones),
            'skinJointCount':28,'maximumInfluences':4,'maxWeightSumError':float(np.abs(weights.sum(axis=1)-1).max()),
            'geometryChanged':False,'bindPose':'Original dunk pose','ballSeparateMesh':True,
            'boneInfluencedVertices':{bones[i]['name']:int(((joints==i)&(weights>.02)).any(axis=1).sum()) for i in range(29)},
            'limitations':['Bounded interactive posing around the original dunk; not a neutral animation rig',
                           'Finger controls rotate each whole digit at its base; no individual knuckle joints',
                           'No cloth simulation or automatic collision avoidance']}
    (ROOT/'pose-rig-validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['status','vertexCount','triangleCount','jointControls','maxWeightSumError']}))


if __name__=='__main__':
    main()
