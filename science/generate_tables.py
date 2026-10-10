"""Generate IASP91 direct arrivals with cell validation and conservative rejection.
Run with the pinned science environment. Checkpoints permit interrupted regeneration.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
import json, hashlib, time, pathlib, argparse
import numpy as np
from obspy.taup import TauPyModel
from concurrent.futures import ProcessPoolExecutor
ROOT=pathlib.Path(__file__).resolve().parents[1]; OUT=ROOT/'public/assets/model'; OUT.mkdir(parents=True,exist_ok=True)
MODEL=None

def init():
 global MODEL
 MODEL=TauPyModel('iasp91')

def point(z,d):
 a=MODEL.get_travel_times(float(z),float(d),phase_list=['p','P','s','S'])
 out=[]
 for names in [('p','P'),('s','S')]:
  v=next((x for x in a if x.name in names),None)
  out.append((float(v.time),1 if v.name==names[0] else 2,float(v.ray_param)) if v else (-1,0,0))
 return out

def band(zi):
 init(); z=zi*10; cache=ROOT/'science/.cache'; cache.mkdir(exist_ok=True); path=cache/f'checkpoint-{zi}.npz'
 if path.exists():
  v=np.load(path);return zi,v['nodes'],v['bounds'],v['samples'],v['errors']
 start=time.time(); nodes=np.array([point(z,d) for d in np.arange(0,180.001,.25)],dtype=np.float64)
 # Five fresh TauP samples per cell. Matching phase and smooth ray parameter are mandatory.
 bounds=np.full((720,2),-1.,dtype=np.float32); errors=[]; samples=0
 if zi<70:
  upper=np.array([point(z+10,d) for d in np.arange(0,180.001,.25)])
  for j in range(720):
   corners=np.array([nodes[j],nodes[j+1],upper[j],upper[j+1]])
   candidates=[k for k in range(2) if np.all(corners[:,k,0]>=0) and len(set(corners[:,k,1]))==1 and np.ptp(corners[:,k,2])<30]
   if not candidates:continue
   checks=[]
   for a,b in [(0.5,0.5),(0,.5),(1,.5),(.5,0),(.5,1)]:
    truth=np.array(point(z+10*a,(j+b)*.25));samples+=1
    pred=(1-a)*((1-b)*corners[0,:,0]+b*corners[1,:,0])+a*((1-b)*corners[2,:,0]+b*corners[3,:,0])
    checks.append((truth,pred))
   for k in candidates:
    err=max(abs(t[k,0]-p[k]) for t,p in checks)
    valid=all(t[k,0]>=0 and t[k,1]==corners[0,k,1] and min(corners[:,k,2])-2<=t[k,2]<=max(corners[:,k,2])+2 for t,p in checks)
    if valid and err<=1.8:bounds[j,k]=err;errors.append(err)
 np.savez_compressed(path,nodes=nodes,bounds=bounds,samples=samples,errors=errors)
 print(f'depth {z}: {int(np.sum(bounds>=0))} accepted phase cells, {time.time()-start:.1f}s',flush=True)
 return zi,nodes,bounds,samples,np.array(errors)

def main():
 start=time.time(); data=[None]*71
 with ProcessPoolExecutor(max_workers=int(os.getenv('PULSE_SCIENCE_WORKERS','8'))) as pool:
  for row in pool.map(band,range(71)):data[row[0]]=row
 nodes=np.array([x[1] for x in data]); bounds=np.array([x[2] for x in data[:70]])
 times=nodes[:,:,:,0].astype('<f4'); phases=nodes[:,:,:,1].astype('u1'); ray=nodes[:,:,:,2].astype('<f4')
 files={'times.bin':times.tobytes(),'phases.bin':phases.tobytes(),'bounds.bin':bounds.astype('<f4').tobytes()}
 init(); rays=[]
 for distance,names in [(60,['P','S']),(150,['PKP']),(110,['SKS'])]:
  for i,a in enumerate(MODEL.get_ray_paths(30,distance,phase_list=names)):
   rays.append(dict(id=f'{distance}-{a.name}-{i}',phase=a.name,sourceDepthKm=30,distanceDeg=distance,travelSeconds=a.time,path=[[float(p['time']),float(p['dist']),float(p['depth'])] for p in a.path]))
 files['rays.json']=json.dumps(rays,separators=(',',':')).encode()
 errors=np.concatenate([x[4] for x in data if len(x[4])]);report={'schemaVersion':1,'method':'five fresh TauP samples per accepted cell; phase identity and ray parameter continuity rejection','seed':91,'samples':sum(int(x[3]) for x in data),'acceptedCells':int(np.sum(bounds>=0)),'rejectedCells':int(np.sum(bounds<0)),'maximumErrorSeconds':float(max(errors)),'p99ErrorSeconds':float(np.percentile(errors,99)),'generationSeconds':time.time()-start,'rawBytes':sum(map(len,files.values())),'limitation':'Discontinuous, missing-phase and phase-switch cells are rejected. Continuous candidate cells passed without refinement.'}
 files['validation.json']=json.dumps(report,indent=2).encode()
 for name,body in files.items():(OUT/name).write_bytes(body)
 import obspy
 src=pathlib.Path(obspy.__file__).parent/'taup/data/iasp91.npz'
 manifest={'schemaVersion':1,'model':'iasp91','modelVersion':'ObsPy 1.5.0 / IASP91','earthRadiusKm':6371,'units':'seconds, kilometers, degrees','depths':list(range(0,701,10)),'distances':[i*.25 for i in range(721)],'phaseMapping':{'P':{'1':'p','2':'P'},'S':{'1':'s','2':'S'}},'boundaries':{'moho':35,'coreMantle':float(MODEL.model.cmb_depth),'innerCore':float(MODEL.model.iocb_depth)},'sourceModelChecksum':hashlib.sha256(src.read_bytes()).hexdigest(),'generationCommand':'python science/generate_tables.py','files':{n:{'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)} for n,b in files.items()}}
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(report),flush=True)
if __name__=='__main__':main()
