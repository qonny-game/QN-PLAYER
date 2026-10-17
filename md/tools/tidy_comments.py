# tidy_comments.py — コメント内の版番号タグ(【v3.58.0】/(v4.67.0)/v3.5.0〜 等)だけを外す。コード・文字列は触らない(//・/* の後ろだけ処理)。
# 使い方: python3 -I md/tools/tidy_comments.py <ルート>            変更予定を表示(ドライラン)
#         python3 -I md/tools/tidy_comments.py <ルート> apply   書き換え。その後 node --check と snap の前後比較で確認する
import re,sys,glob
root=sys.argv[1]; apply=len(sys.argv)>2
skip=re.compile(r'jszip|lame_min|qn-basic-pitch|soundtouch-core|LICENSE|/stem/')
V=r'v?\d+\.\d+\.\d+'
def clean(c):
    o=c
    c=re.sub(r'【(?:v\d+\.\d+\.\d+[/、,・ ]*)+([^】]*)】',lambda m:('【'+m.group(1).strip()+'】') if m.group(1).strip() else '',c)
    c=re.sub(r'\s*[（(]\s*'+V+r'\s*[）)]','',c)
    c=re.sub(r'\s*[（(]\s*v\d+\.\d+\.\d+\s*[〜~]\s*[）)]','',c)
    c=re.sub(r'\bv\d+\.\d+\.\d+\s*[〜~]\s*[:：]\s*','',c)
    c=re.sub(r'\bv\d+\.\d+\.\d+\s*[〜~]\s*','',c)
    c=re.sub(r'(?<![\w.])v\d+\.\d+\.\d+\s*:\s*','',c)
    c=re.sub(r'=\s*v\d+\.\d+\.\d+','',c)
    c=re.sub(r'\s*[（(]\s*v\d+\.\d+\.\d+\s*[〜~]\s*[^）)]*[）)]','',c)
    return c
n=0
for f in glob.glob(root+'/**/*',recursive=True):
    if not f.endswith(('.js','.css','.html')) or skip.search(f): continue
    if '/guide/' in f and f.endswith('.html'): continue
    if f.endswith('.html') and not f.endswith('index.html'): continue
    L=open(f,encoding='utf-8').read().split('\n'); ch=False
    for i,l in enumerate(L):
        new=l
        m=re.search(r'(^\s*//|(?<=\s)//|/\*|<!--)',l)
        if m:
            head,tail=l[:m.start()],l[m.start():]
            if f.endswith('.css') or f.endswith('.html') or True:
                nt=clean(tail)
                new=head+nt
        elif re.match(r'^\s*\*',l):
            new=clean(l)
        if new!=l:
            n+=1
            if not apply: print(f.replace(root+'/',''),i+1,'\n  -',l.strip()[:140],'\n  +',new.strip()[:140])
            L[i]=new; ch=True
    if ch and apply: open(f,'w',encoding='utf-8').write('\n'.join(L))
print('lines changed:',n)
