import sys
from PIL import Image
out=sys.argv[1]; ims=[Image.open(p).convert('RGB') for p in sys.argv[2:]]
h=max(i.height for i in ims); w=sum(i.width for i in ims)+12*(len(ims)-1)
m=Image.new('RGB',(w,h),(52,52,56)); x=0
for i in ims: m.paste(i,(x,0)); x+=i.width+12
m.save(out)
