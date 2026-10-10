"""Validate checked-in numerical assets, manifests, and fresh seeded TauP samples."""
import json,hashlib,pathlib,random
import numpy as np
from obspy.taup import TauPyModel
root=pathlib.Path(__file__).resolve().parents[1]/'public/assets/model';m=json.loads((root/'manifest.json').read_text())
for n,v in m['files'].items():
 b=(root/n).read_bytes();assert len(b)==v['bytes'] and hashlib.sha256(b).hexdigest()==v['sha256']
t=np.fromfile(root/'times.bin',dtype='<f4').reshape(71,721,2);p=np.fromfile(root/'phases.bin',dtype='u1').reshape(71,721,2);b=np.fromfile(root/'bounds.bin',dtype='<f4').reshape(70,720,2)
model=TauPyModel('iasp91');random.seed(91);errors=[]
for _ in range(500):
 i=random.randrange(70);j=random.randrange(720);a=random.random();c=random.random()
 truth=model.get_travel_times(i*10+a*10,(j+c)*.25,phase_list=['p','P','s','S'])
 for k,names in enumerate([['p','P'],['s','S']]):
  if b[i,j,k]<0:continue
  arrival=next((x for x in truth if x.name in names),None);assert arrival
  pred=(1-a)*((1-c)*t[i,j,k]+c*t[i,j+1,k])+a*((1-c)*t[i+1,j,k]+c*t[i+1,j+1,k])
  err=abs(pred-arrival.time);assert err<=2, (i,j,k,err);errors.append(float(err))
report=json.loads((root/'validation.json').read_text());report['seededRandomValidation']={'seed':91,'attempts':500,'acceptedSamples':len(errors),'maximumErrorSeconds':max(errors)}
(root/'validation.json').write_text(json.dumps(report,indent=2));v=(root/'validation.json').read_bytes();m['files']['validation.json']={'sha256':hashlib.sha256(v).hexdigest(),'bytes':len(v)};(root/'manifest.json').write_text(json.dumps(m,indent=2));print(json.dumps(report,indent=2))
