#!/usr/bin/env python3
"""Extract a split zip (name.z01, name.z02 ... name.zip): python3 scripts/unsplit_zip.py <base> <outdir>.
`zip -s 0` mangles multi-entry split archives (per-disk offsets), so local headers are walked sequentially and CRCs checked."""
import sys,struct,zlib,os,glob
base=sys.argv[1]; out=sys.argv[2]; only=set(sys.argv[3:])
parts=sorted(glob.glob(base+'.z[0-9][0-9]'))+[base+'.zip']
data=b''.join(open(p,'rb').read() for p in parts)
off0=4 if data[:4]==b'PK\x07\x08' else 0
# end of central directory (in the last part)
e=data.rfind(b'PK\x05\x06'); _,dn,cdd,nd,ne,csz,cof,cl=struct.unpack('<IHHHHIIH',data[e:e+22])
cd_start=len(data)-(len(data)-e)-csz  # CD sits right before EOCD
entries=[];p=cd_start
for _ in range(ne):
    assert data[p:p+4]==b'PK\x01\x02',hex(struct.unpack('<I',data[p:p+4])[0])
    (sig,vm,vn,fl,meth,mt,md,crc,cs,us,nl,el,cl_,ds,ia,ea,ro)=struct.unpack('<IHHHHHHIIIHHHHHII',data[p:p+46])
    name=data[p+46:p+46+nl].decode('utf-8','replace'); entries.append((name,meth,crc,cs,us,fl)); p+=46+nl+el+cl_
os.makedirs(out,exist_ok=True); pos=off0
for name,meth,crc,cs,us,fl in entries:
    sig,ver,lfl,lm,mt,md,lcrc,lcs,lus,nl,el=struct.unpack('<IHHHHHIIIHH',data[pos:pos+30]); assert sig==0x04034b50,(name,pos)
    start=pos+30+nl+el; raw=data[start:start+cs]
    if name.endswith('/'): os.makedirs(os.path.join(out,name),exist_ok=True)
    elif not only or os.path.basename(name) in only:
        dst=os.path.join(out,name); os.makedirs(os.path.dirname(dst),exist_ok=True)
        if meth==0: body=raw
        else: body=zlib.decompress(raw,-15)
        ok=(zlib.crc32(body)&0xffffffff)==crc
        open(dst,'wb').write(body); print(name,len(body),'crc ok' if ok else 'CRC MISMATCH')
    pos=start+cs
    if lfl&8:
        pos+= 16 if data[pos:pos+4]==b'PK\x07\x08' else 12
