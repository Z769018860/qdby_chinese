# -*- coding: utf-8 -*-
"""从正在运行的迅雷进程内存里捞网盘令牌

客户端要保持登录，access_token / refresh_token 一定以明文躺在某个进程的堆里。
只扫 MEM_PRIVATE 的已提交区域（堆），跳过镜像和大文件映射，命中即解析 JWT 取 exp。
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import json
import re
import subprocess
import sys
import time

k32 = ctypes.WinDLL('kernel32', use_last_error=True)


class MEMORY_BASIC_INFORMATION(ctypes.Structure):
    _fields_ = [('BaseAddress', ctypes.c_void_p),
                ('AllocationBase', ctypes.c_void_p),
                ('AllocationProtect', wt.DWORD),
                ('RegionSize', ctypes.c_size_t),
                ('State', wt.DWORD),
                ('Protect', wt.DWORD),
                ('Type', wt.DWORD)]


k32.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
k32.OpenProcess.restype = wt.HANDLE
k32.VirtualQueryEx.argtypes = [wt.HANDLE, ctypes.c_void_p,
                               ctypes.POINTER(MEMORY_BASIC_INFORMATION), ctypes.c_size_t]
k32.VirtualQueryEx.restype = ctypes.c_size_t
k32.ReadProcessMemory.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
                                  ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
k32.ReadProcessMemory.restype = wt.BOOL
k32.CloseHandle.argtypes = [wt.HANDLE]
k32.CloseHandle.restype = wt.BOOL

PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010
MEM_COMMIT = 0x1000
MEM_PRIVATE = 0x20000
PAGE_GUARD = 0x100
PAGE_NOACCESS = 0x01
READABLE = (0x02, 0x04, 0x08, 0x20, 0x40, 0x80)

JWT_RE = re.compile(rb'eyJhbGciOiJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}')
RT_RE = re.compile(rb'a1\.[A-Za-z0-9_\-]{40,120}')


def pids_of(names=('thunder', 'xldl', 'xlbrowser')):
    out = subprocess.run(['tasklist', '/fo', 'csv', '/nh'], capture_output=True, text=True,
                         encoding='mbcs', errors='replace').stdout
    hits = []
    for line in out.splitlines():
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) >= 2 and parts[0].lower().split('.')[0] in names:
            try:
                hits.append((int(parts[1]), parts[0]))
            except ValueError:
                pass
    return hits


def scan(pid, budget=3 * 1024 ** 3, chunk_size=4 * 1024 ** 2):
    h = k32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not h:
        return None, 'OpenProcess 失败 err=%d' % ctypes.get_last_error()
    found, rts = [], set()
    addr = 0
    total = 0
    limit = 0x7FFFFFFF0000
    while addr < limit:
        mbi = MEMORY_BASIC_INFORMATION()
        if not k32.VirtualQueryEx(h, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi)):
            break
        base = mbi.BaseAddress or 0
        size = mbi.RegionSize or 0
        if size == 0:
            break
        usable = (mbi.State == MEM_COMMIT and mbi.Type == MEM_PRIVATE
                  and not (mbi.Protect & PAGE_GUARD)
                  and mbi.Protect not in (0, PAGE_NOACCESS)
                  and (mbi.Protect & 0xFF) in READABLE
                  and size <= 1024 ** 3)
        if usable:
            off = 0
            while off < size:
                want = min(chunk_size, size - off)
                buf = ctypes.create_string_buffer(want)
                read = ctypes.c_size_t(0)
                ok = k32.ReadProcessMemory(h, ctypes.c_void_p(base + off),
                                           ctypes.cast(buf, ctypes.c_void_p), want,
                                           ctypes.byref(read))
                if ok and read.value:
                    data = buf.raw[:read.value]
                    total += read.value
                    found.extend(m.group(0).decode('latin-1') for m in JWT_RE.finditer(data))
                    rts.update(m.group(0).decode('latin-1') for m in RT_RE.finditer(data))
                off += want
                if total > budget:
                    break
        addr = base + size
        if total > budget:
            break
    k32.CloseHandle(h)
    return (found, sorted(rts)), '扫了 %.0f MB' % (total / 1024 ** 2)


def claims(tok):
    import base64
    try:
        p = tok.split('.')[1]
        p += '=' * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p))
    except Exception:
        return {}


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else 'xunlei-memtokens.json'
    cands, all_rt = {}, set()
    for pid, name in pids_of():
        try:
            res, note = scan(pid)
        except Exception as e:
            print('pid %d %s: 异常 %s' % (pid, name, str(e)[:80]))
            continue
        if res is None:
            print('pid %d %s: %s' % (pid, name, note))
            continue
        found, rts = res
        all_rt.update(rts)
        uniq = {t: claims(t) for t in set(found)}
        live = {t: c for t, c in uniq.items() if c.get('exp', 0) > time.time()}
        print('pid %d %s: %s，JWT %d 个，未过期 %d 个，refresh 候选 %d'
              % (pid, name, note, len(uniq), len(live), len(rts)))
        for t, c in sorted(live.items(), key=lambda x: -x[1].get('exp', 0))[:3]:
            print('   exp %s aud=%s keys=%s'
                  % (time.strftime('%Y-%m-%d %H:%M', time.localtime(c.get('exp', 0))),
                     c.get('aud'), sorted(c)[:8]))
        cands.update(live)
    if not cands and not all_rt:
        print('没捞到可用令牌')
        return 1
    payload = {'tokens': {t: c for t, c in cands.items()}, 'refresh': sorted(all_rt)}
    json.dump(payload, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('落盘 %d 个未过期令牌 / %d 个 refresh 候选 -> %s'
          % (len(cands), len(all_rt), out_path))
    return 0


if __name__ == '__main__':
    sys.exit(main())
