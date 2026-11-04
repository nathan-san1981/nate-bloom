import re, sys
import os
SRC=os.environ.get('AW_SRC', 'airwindows/plugins/LinuxVST/src')
def gen(name):
    h=open(f'{SRC}/{name}/{name}.h').read(); c=open(f'{SRC}/{name}/{name}.cpp').read(); pr=open(f'{SRC}/{name}/{name}Proc.cpp').read()
    priv=h[h.index('private:'):h.rindex('};')]
    mem=[l for l in priv.split('\n') if re.match(r'\s*(double|float|int|uint32_t|bool|long double)\b', l)]
    body=pr[pr.index('::processReplacing'):]; body=body[body.index('{'):body.index('void '+name+'::processDoubleReplacing')]
    ctor=c[c.index(f'{name}::{name}('):]; ctor=ctor[ctor.index('{')+1:]
    ctor=ctor[:ctor.index('_canDo')] if '_canDo' in ctor else ctor[:ctor.index('}')]
    ctor=re.sub(r'fpd[LR] = 1\.0; while \(fpd[LR] < 16386\) fpd[LR] = rand\(\)\*UINT32_MAX;','',ctor)
    out=f'''#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
typedef int VstInt32;
struct P {{
double SR = 48000; double getSampleRate() {{ return SR; }}
{chr(10).join(mem)}
P() {{ {ctor} fpdL = 17; fpdR = 4567; }}
void processReplacing(float **inputs, float **outputs, VstInt32 sampleFrames) {body}
}};
int main(int argc, char** argv) {{
  P p; float* pv[] = {{ &p.A, &p.B, &p.C, &p.D{', &p.E' if re.search(r'\bE;', h) else ''}{', &p.F' if re.search(r'\bF;', h) else ''} }};
  int np = sizeof(pv) / sizeof(pv[0]); for (int i = 0; i < np && i + 3 < argc; i++) *pv[i] = atof(argv[i + 3]);
  FILE* fi = fopen(argv[1], "rb"); fseek(fi, 0, SEEK_END); long n = ftell(fi) / 8; fseek(fi, 0, SEEK_SET);
  float* L = new float[n], * R = new float[n], * oL = new float[n], * oR = new float[n];
  for (long i = 0; i < n; i++) {{ fread(&L[i], 4, 1, fi); fread(&R[i], 4, 1, fi); }} fclose(fi);
  for (long s = 0; s < n; s += 128) {{ int m = n - s < 128 ? n - s : 128; float* ins[2] = {{ L + s, R + s }}; float* outs[2] = {{ oL + s, oR + s }}; p.processReplacing(ins, outs, m); }}
  FILE* fo = fopen(argv[2], "wb"); for (long i = 0; i < n; i++) {{ fwrite(&oL[i], 4, 1, fo); fwrite(&oR[i], 4, 1, fo); }} fclose(fo);
}}
'''
    open(f'{name}.cc','w').write(out)
for n in sys.argv[1:]: gen(n)
