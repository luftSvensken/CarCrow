"""Export Google's exact text encoder, mean pooling and 256d normalized output."""
import json, os, pathlib, shutil
import torch
from transformers import AutoModel, AutoTokenizer
from onnxruntime.quantization import quantize_dynamic, QuantType
import truststore
truststore.inject_into_ssl()
output=pathlib.Path(os.environ.get('CARCROW_ONNX_OUTPUT',str(pathlib.Path.cwd()/'models/embeddinggemma-2')))
output.mkdir(parents=True,exist_ok=True)
model=AutoModel.from_pretrained('google/embeddinggemma-2',vision_config=None,audio_config=None,dtype=torch.float32,attn_implementation='eager',cache_dir=os.environ.get('CARCROW_MODEL_CACHE')).eval()
tokenizer=AutoTokenizer.from_pretrained('google/embeddinggemma-2',cache_dir=os.environ.get('CARCROW_MODEL_CACHE'))
torch.set_num_threads(4)
class Encoder(torch.nn.Module):
 def __init__(self):
  super().__init__();self.encoder=model.language_model
 def forward(self,input_ids,attention_mask):
  batch,length=input_ids.shape
  mask=(1.0-attention_mask[:,None,None,:].float())*torch.finfo(torch.float32).min
  mask=mask.expand(batch,1,length,length)
  positions=torch.arange(length,dtype=torch.int64)[None,:]
  features=self.encoder(input_ids=input_ids,attention_mask={'full_attention':mask,'sliding_attention':mask},position_ids=positions,return_dict=True).last_hidden_state
  pooled=(features*attention_mask.unsqueeze(-1)).sum(1)/attention_mask.sum(1,keepdim=True).clamp(min=1)
  return torch.nn.functional.normalize(pooled[:,:256],p=2,dim=-1)
encoder=Encoder().eval();sample=tokenizer(['title: none | text: BMW 320d diesel automat 2017.'],padding=True,truncation=True,max_length=256,return_tensors='pt')
ids,mask=sample['input_ids'],sample['attention_mask']
print('Exporting the text encoder',flush=True)
with torch.inference_mode():
 expected=encoder(ids,mask).numpy()
 torch.onnx.export(encoder,(ids,mask),str(output/'model-fp32.onnx'),input_names=['input_ids','attention_mask'],output_names=['embeddings'],dynamic_axes={'input_ids':{0:'batch',1:'sequence'},'attention_mask':{0:'batch',1:'sequence'},'embeddings':{0:'batch'}},opset_version=18,dynamo=False)
import onnx
exported=onnx.load(str(output/'model-fp32.onnx'))
onnx.save_model(exported,str(output/'model-fp32.onnx'),save_as_external_data=True,all_tensors_to_one_file=True,location='model-fp32.data',size_threshold=1024)
del exported
print('Quantizing weights for local inference',flush=True)
quantize_dynamic(str(output/'model-fp32.onnx'),str(output/'model.onnx'),weight_type=QuantType.QInt8,per_channel=True,reduce_range=True,op_types_to_quantize=['MatMul','Gather'])
import onnxruntime as ort
import numpy as np
session=ort.InferenceSession(str(output/'model.onnx'),providers=['CPUExecutionProvider'])
actual=session.run(None,{'input_ids':ids.numpy(),'attention_mask':mask.numpy()})[0]
sim=float(np.dot(expected[0],actual[0])/(np.linalg.norm(expected[0])*np.linalg.norm(actual[0])))
assert sim>.98,sim
print(json.dumps({'model':'google/embeddinggemma-2','cosineAgreement':sim,'bytes':(output/'model.onnx').stat().st_size}),flush=True)
tokenizer.save_pretrained(str(output))
(output/'manifest.json').write_text(json.dumps({'model':'google/embeddinggemma-2','dimensions':256,'maxTokens':256,'promptQuery':'task: search result | query: ','promptDocument':'title: none | text: ','license':'Apache-2.0','quantization':'int8-reduced-range','cosineAgreement':sim},indent=2))

import urllib.request
with urllib.request.urlopen('https://www.apache.org/licenses/LICENSE-2.0.txt') as response: (output/'LICENSE').write_bytes(response.read())
for name in ['model-fp32.onnx','model-fp32.data']:
 if (output/name).exists(): (output/name).unlink()
