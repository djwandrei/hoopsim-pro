"""Skin the redesigned neutral athlete and preserve all source geometry."""
import os
for name in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS'):os.environ[name]='1'
from pathlib import Path
import base64
import hashlib
import json
import numpy as np
import build_pose_rig as core
from refine_athlete_skin import shoulder_weights

ROOT=Path(__file__).resolve().parent



def blend_ankle_connections(positions,joints,weights,body_count):
    """Blend around the ankle inside the collar, retaining rigid soles and forefeet."""
    body=positions[:body_count]
    counts={}
    for side,sign,shin,foot in (('right',-1,13,14),('left',1,16,17)):
        mask=(body[:,0]*sign>0)&(np.abs(body[:,0]-sign*.110)<.095)&(body[:,1]<.310)
        ids=np.flatnonzero(mask)
        t=np.clip((.245-body[ids,1])/.130,0,1).astype(float)
        foot_weight=t*t*(3-2*t)
        rigid=(body[ids,1]<=.115)|((body[ids,2]>.075)&(body[ids,1]<.160))
        foot_weight[rigid]=1
        joints[ids]=0;weights[ids]=0
        joints[ids,0]=shin;joints[ids,1]=foot
        weights[ids,0]=1-foot_weight;weights[ids,1]=foot_weight
        counts[side]={'vertices':len(ids),'blendBottomMeters':.115,'blendTopMeters':.245,
                      'maximumRigidShoeHeightMeters':.115,'rigidForefootMinZMeters':.075,
                      'rigidForefootMaxHeightMeters':.160}
    return counts


def main():
    source,doc,positions,normals,faces,parts=core.load_model('basketball-athlete.glb')
    anatomy=json.loads((ROOT/'athlete-anatomy.json').read_text())
    pivots=anatomy['jointPivots']; fields_by_name=anatomy['skinFields']
    body_count=parts[1]['firstVertex']
    bones,_=core.skeleton(0)
    labels={6:'Right shoulder',7:'Right elbow',8:'Right wrist',
            9:'Left shoulder',10:'Left elbow',11:'Left wrist',
            12:'Right hip',13:'Right knee',14:'Right foot',
            15:'Left hip',16:'Left knee',17:'Left foot'}
    digits=['Index finger','Middle finger','Ring finger','Little finger','Thumb']
    for i,label in labels.items():bones[i]['label']=label
    for side,start in [('Right',18),('Left',23)]:
        for i,digit in enumerate(digits):bones[start+i]['label']=side+' '+digit.lower()
    bone_children={6:7,7:8,9:10,10:11,12:13,13:14,15:16,16:17}
    fields=[]
    for i,bone in enumerate(bones):
        name=bone['name']
        bone['pivot']=pivots[name] if i else [0,0,0]
        controls=fields_by_name.get(name,[])
        fields.append(controls)
        if i in bone_children:
            direction=np.subtract(pivots[bones[bone_children[i]]['name']],bone['pivot'])
            normal=(1,0,0) if i in (12,13,15,16) else (0,0,1)
            bone['axes']=core.frame(direction,normal)
        elif i in (8,11) or 18<=i<=27:
            direction=np.subtract(controls[-1][:3],bone['pivot'])
            bone['axes']=core.frame(direction,np.cross(direction,(0,0,1)))
        elif i in (14,17):
            direction=np.subtract(controls[-1][:3],bone['pivot'])
            bone['axes']=core.frame(direction,(1,0,0))
    ball_pivot=(positions[body_count:].min(axis=0).astype(float)+positions[body_count:].max(axis=0).astype(float))*.5
    bones[28]['pivot']=ball_pivot.tolist()
    # Neutral joints are edited around each preset's authored base, so users can
    # make local adjustments without constraining all presets to the dunk pose.
    joints,weights=core.skin_weights(positions,faces,fields,body_count)
    ankle_connections=blend_ankle_connections(positions,joints,weights,body_count)
    joints,weights,shoulder_connections=shoulder_weights(positions,joints,weights,body_count)
    assert np.isfinite(weights).all() and (weights>=0).all()
    assert np.abs(weights.sum(axis=1)-1).max()<2e-7
    glb=core.export_rigged(doc,positions,normals,faces,joints,weights,bones,body_count,ball_pivot,
        output_name='basketball-athlete-poseable.glb',bind_label='Neutral athletic A stance')
    rig={'version':1,'vertexCount':len(positions),'sourceSha256':hashlib.sha256(source).hexdigest(),
        'riggedGlbSha256':hashlib.sha256(glb).hexdigest(),'bones':bones,
        'jointsBase64':base64.b64encode(joints.tobytes()).decode(),
        'weightsBase64':base64.b64encode(weights.tobytes()).decode(),'ballIndex':28,'handIndex':8,
        'ballRange':{'firstVertex':body_count,'count':len(positions)-body_count},
        'defaultPose':{'rotations':[[0,0,0] for _ in bones],'translations':[[0,0,0] for _ in bones],
                       'ballAttached':True,'ballVisible':True}}
    (ROOT/'athlete-rig-data.js').write_text('globalThis.SILHOUETTE_RIG = '+json.dumps(rig,separators=(',',':'))+';\n')
    report={'status':'passed','sourceGlbSha256':rig['sourceSha256'],'riggedGlbSha256':rig['riggedGlbSha256'],
        'vertexCount':len(positions),'triangleCount':len(faces),'jointControls':29,'skinJointCount':28,
        'geometryChangedByRig':False,'ankleConnections':ankle_connections,'shoulderConnections':shoulder_connections,'maxWeightSumError':float(np.abs(weights.sum(axis=1)-1).max()),
        'bindPose':'Neutral athletic A stance','ballSeparateMesh':True,
        'boneInfluencedVertices':{bones[i]['name']:int(((joints==i)&(weights>.02)).any(axis=1).sum()) for i in range(29)}}
    (ROOT/'athlete-rig-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['status','vertexCount','triangleCount','jointControls']}))


if __name__=='__main__':main()
