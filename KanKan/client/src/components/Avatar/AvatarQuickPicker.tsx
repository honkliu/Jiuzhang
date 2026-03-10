import React, { useState, useCallback } from 'react';
import {
  Box,
  Chip,
} from '@mui/material';
import { useLanguage } from '@/i18n/LanguageContext';
import type { SelectedPrompt } from '@/components/Avatar/PromptComposer';

const BoxAny = Box as any;

// ── Curated prompt data for avatar editing ──
// Each entry: [en, zh, shortLabel_en, shortLabel_zh]
// shortLabel is what appears on the chip (concise); en/zh is the full prompt sent to the model.

type QuickPrompt = [en: string, zh: string, labelEn: string, labelZh: string];

interface QuickCategory {
  id: string;
  en: string;
  zh: string;
  prompts: QuickPrompt[];
}

const categories: QuickCategory[] = [
  {
    id: 'hair-color', en: 'Hair Color', zh: '发色',
    prompts: [
      ['Change hair color to platinum blonde', '将发色改为铂金色', 'Platinum Blonde', '铂金色'],
      ['Change hair color to golden blonde', '将发色改为金色', 'Golden Blonde', '金色'],
      ['Change hair color to honey blonde', '将发色改为蜜金色', 'Honey Blonde', '蜜金色'],
      ['Change hair color to strawberry blonde', '将发色改为草莓金', 'Strawberry Blonde', '草莓金'],
      ['Change hair color to chocolate brown', '将发色改为巧克力棕', 'Chocolate Brown', '巧克力棕'],
      ['Change hair color to chestnut brown', '将发色改为栗棕色', 'Chestnut Brown', '栗棕色'],
      ['Change hair color to caramel brown', '将发色改为焦糖棕', 'Caramel Brown', '焦糖棕'],
      ['Change hair color to auburn', '将发色改为赤褐色', 'Auburn', '赤褐色'],
      ['Change hair color to dark brown', '将发色改为深棕色', 'Dark Brown', '深棕色'],
      ['Change hair color to jet black', '将发色改为乌黑色', 'Jet Black', '乌黑色'],
      ['Change hair color to blue-black', '将发色改为蓝黑色', 'Blue-Black', '蓝黑色'],
      ['Change hair color to copper red', '将发色改为铜红色', 'Copper Red', '铜红色'],
      ['Change hair color to cherry red', '将发色改为樱桃红', 'Cherry Red', '樱桃红'],
      ['Change hair color to burgundy', '将发色改为酒红色', 'Burgundy', '酒红色'],
      ['Change hair color to wine red', '将发色改为葡萄酒红', 'Wine Red', '葡萄酒红'],
      ['Change hair color to silver gray', '将发色改为银灰色', 'Silver Gray', '银灰色'],
      ['Change hair color to pearl white', '将发色改为珍珠白', 'Pearl White', '珍珠白'],
      ['Change hair color to rose gold', '将发色改为玫瑰金', 'Rose Gold', '玫瑰金'],
      ['Change hair color to pastel pink', '将发色改为粉彩粉', 'Pastel Pink', '粉彩粉'],
      ['Change hair color to ice blue', '将发色改为冰蓝色', 'Ice Blue', '冰蓝色'],
      ['Change hair color to lavender', '将发色改为薰衣草紫', 'Lavender', '薰衣草紫'],
      ['Change hair color to emerald green', '将发色改为祖母绿', 'Emerald Green', '祖母绿'],
      ['Change hair color to rainbow multicolor', '将发色改为彩虹多色', 'Rainbow', '彩虹多色'],
      ['Change hair color to ombre blonde to brown', '将发色改为金色到棕色渐变', 'Ombre', '金棕渐变'],
    ],
  },
  {
    id: 'hair-style', en: 'Hair Style', zh: '发型',
    prompts: [
      ['Change hairstyle to a short textured pixie cut', '将发型改为短碎纹理精灵头', 'Pixie Cut', '精灵短发'],
      ['Change hairstyle to a classic chin-length bob', '将发型改为经典齐下巴波波头', 'Bob', '波波头'],
      ['Change hairstyle to a shoulder-length lob', '将发型改为齐肩长波波头', 'Lob', '齐肩长波波'],
      ['Change hairstyle to long layered hair with face-framing layers', '将发型改为长碎层配脸部框架层次', 'Long Layers', '长碎层'],
      ['Change hairstyle to curtain bangs parted in center', '将发型改为中分窗帘刘海', 'Curtain Bangs', '窗帘刘海'],
      ['Change hairstyle to blunt straight-across bangs', '将发型改为齐平直刘海', 'Blunt Bangs', '齐刘海'],
      ['Change hairstyle to wispy thin see-through bangs', '将发型改为轻薄空气刘海', 'Air Bangs', '空气刘海'],
      ['Change hairstyle to a Japanese hime cut straight', '将发型改为日式公主切直发', 'Hime Cut', '公主切'],
      ['Change hairstyle to loose beach waves', '将发型改为松散海滩波浪卷', 'Beach Waves', '海滩波浪'],
      ['Change hairstyle to glamorous Hollywood waves', '将发型改为好莱坞大波浪卷', 'Hollywood Waves', '大波浪'],
      ['Change hairstyle to tight ringlet curls', '将发型改为紧密螺旋卷', 'Ringlet Curls', '螺旋卷'],
      ['Change hairstyle to an elegant high bun', '将发型改为优雅高丸子头', 'High Bun', '高丸子头'],
      ['Change hairstyle to a messy loose bun', '将发型改为松散凌乱丸子头', 'Messy Bun', '凌乱丸子头'],
      ['Change hairstyle to a high ponytail with volume', '将发型改为高马尾蓬松', 'High Ponytail', '高马尾'],
      ['Change hairstyle to double braids pigtails', '将发型改为双编辫子', 'Double Braids', '双编辫'],
      ['Change hairstyle to a classic crew cut', '将发型改为经典平头', 'Crew Cut', '平头'],
      ['Change hairstyle to a textured quiff', '将发型改为纹理蓬松飞机头', 'Quiff', '飞机头'],
      ['Change hairstyle to a slicked back undercut', '将发型改为大背头削边', 'Undercut', '大背头'],
      ['Change hairstyle to natural afro curls', '将发型改为自然非洲卷', 'Afro', '非洲卷'],
      ['Change hairstyle to a buzz cut', '将发型改为寸头', 'Buzz Cut', '寸头'],
    ],
  },
  {
    id: 'clothing', en: 'Clothing', zh: '服装',
    prompts: [
      ['Change the top to a white crew neck cotton t-shirt', '将上衣换成白色圆领纯棉T恤', 'White T-shirt', '白色T恤'],
      ['Replace the shirt with a black V-neck t-shirt', '将衬衫换成黑色V领T恤', 'Black V-neck', '黑色V领'],
      ['Change the top to a burgundy crew neck t-shirt with rolled sleeves', '将上衣换成酒红色卷袖圆领T恤', 'Burgundy Tee', '酒红T恤'],
      ['Change the shirt to a classic white polo shirt with navy collar', '将衬衫换成经典白色带深蓝领的Polo衫', 'White Polo', '白色Polo衫'],
      ['Replace the shirt with a crisp white cotton dress shirt with French cuffs', '将衬衫换成带法式袖口的白色纯棉正装衬衫', 'White Dress Shirt', '白色正装衬衫'],
      ['Change to a light blue pinpoint oxford dress shirt', '换成浅蓝色牛津纺正装衬衫', 'Blue Oxford', '蓝色牛津衬衫'],
      ['Replace the top with an ivory silk blouse with a pussy-bow tie', '将上衣换成象牙白丝绸蝴蝶结系带衬衫', 'Silk Blouse', '丝绸衬衫'],
      ['Change to a camel cashmere crewneck sweater', '换成驼色羊绒圆领毛衣', 'Cashmere Sweater', '羊绒毛衣'],
      ['Replace the top with a charcoal gray turtleneck sweater', '将上衣换成碳灰色高领毛衣', 'Turtleneck', '高领毛衣'],
      ['Change the top to a heather gray cotton pullover hoodie', '将上衣换成浅灰色纯棉套头连帽衫', 'Gray Hoodie', '灰色连帽衫'],
      ['Replace with a black zip-up hoodie with white drawstrings', '换成黑色白色抽绳拉链连帽衫', 'Black Hoodie', '黑色连帽衫'],
      ['Change to a red and black plaid flannel shirt', '将上衣换成红黑格纹法兰绒衬衫', 'Plaid Flannel', '格纹法兰绒'],
      ['Replace the top with a tropical print Hawaiian shirt', '将上衣换成热带印花夏威夷衬衫', 'Hawaiian Shirt', '夏威夷衬衫'],
      ['Change the top to a white ribbed tank top', '将上衣换成白色螺纹背心', 'Tank Top', '背心'],
      ['Replace with a black satin camisole with lace trim', '换成黑色蕾丝边缎面吊带衫', 'Satin Camisole', '缎面吊带'],
    ],
  },
  {
    id: 'face', en: 'Face & Look', zh: '面部特征',
    prompts: [
      ['Make the face look more East Asian with monolid eyes', '让面部看起来更像东亚面孔，单眼皮', 'East Asian', '东亚面孔'],
      ['Make the face look more European with deep-set eyes', '让面部看起来更像欧洲面孔，深邃眼窝', 'European', '欧洲面孔'],
      ['Make the face look more South Asian with warm skin tone', '让面部看起来更像南亚面孔，暖色肤色', 'South Asian', '南亚面孔'],
      ['Make the face look more African with rich dark skin', '让面部看起来更像非洲面孔，深色皮肤', 'African', '非洲面孔'],
      ['Make the face look more Latin American', '让面部看起来更像拉美面孔', 'Latin American', '拉美面孔'],
      ['Make the face look more Middle Eastern', '让面部看起来更像中东面孔', 'Middle Eastern', '中东面孔'],
      ['Make the person look younger, around 20 years old', '让人物看起来更年轻，大约20岁', 'Age 20', '20岁'],
      ['Make the person look middle-aged, around 40 years old', '让人物看起来中年，大约40岁', 'Age 40', '40岁'],
      ['Make the person look elderly, around 70 years old', '让人物看起来年迈，大约70岁', 'Age 70', '70岁'],
      ['Make the person look like a child, around 8 years old', '让人物看起来像小孩，大约8岁', 'Child (8)', '8岁小孩'],
      ['Add a full thick beard', '添加浓密的络腮胡', 'Full Beard', '络腮胡'],
      ['Add a neat short stubble beard', '添加整齐的短胡茬', 'Stubble', '胡茬'],
      ['Add a classic handlebar mustache', '添加经典翘八字胡', 'Mustache', '八字胡'],
      ['Remove all facial hair for a clean-shaven look', '去除所有面部毛发，干净清爽', 'Clean Shaven', '清爽无须'],
      ['Add natural freckles across the nose and cheeks', '在鼻子和脸颊添加自然雀斑', 'Freckles', '雀斑'],
      ['Apply a natural no-makeup makeup look', '应用自然裸妆效果', 'Natural Makeup', '裸妆'],
      ['Apply full glamorous evening makeup with smoky eyes', '应用华丽晚妆配烟熏眼', 'Glamour Makeup', '华丽晚妆'],
    ],
  },
  {
    id: 'style', en: 'Art Style', zh: '画风转换',
    prompts: [
      ['Convert to Studio Ghibli anime style', '转换为吉卜力动画风格', 'Ghibli', '吉卜力'],
      ['Convert to Disney Pixar 3D cartoon', '转换为迪士尼皮克斯3D卡通', 'Pixar 3D', '皮克斯3D'],
      ['Convert to chibi anime', '转换为Q版动漫', 'Chibi', 'Q版动漫'],
      ['Convert to shonen action anime', '转换为少年动作动漫', 'Shonen Anime', '少年动漫'],
      ['Convert to manga black and white', '转换为黑白漫画', 'Manga B&W', '黑白漫画'],
      ['Convert to manhwa webtoon style', '转换为韩国网漫风格', 'Webtoon', '韩国网漫'],
      ['Convert the portrait to Chinese donghua animation style', '将肖像转换为中国动画风格', 'Donghua', '国漫'],
      ['Convert to 8-bit pixel art', '转换为8位像素艺术', 'Pixel Art', '像素艺术'],
      ['Convert to flat vector illustration', '转换为扁平矢量插画', 'Vector', '矢量插画'],
      ['Convert to Impressionist oil painting style', '转换为印象派油画风格', 'Oil Painting', '油画'],
      ['Convert to Chinese ink wash shuimo painting', '转换为中国水墨画', 'Ink Wash', '水墨画'],
      ['Convert to detailed pencil sketch', '转换为精细铅笔素描', 'Pencil Sketch', '铅笔素描'],
      ['Convert to charcoal sketch', '转换为炭笔素描', 'Charcoal', '炭笔素描'],
      ['Convert to wet-on-wet watercolor', '转换为湿画法水彩', 'Watercolor', '水彩'],
      ['Convert to Warhol Pop Art', '转换为沃霍尔波普艺术', 'Pop Art', '波普艺术'],
      ['Convert to ukiyo-e woodblock print', '转换为浮世绘版画', 'Ukiyo-e', '浮世绘'],
      ['Convert to vaporwave aesthetic', '转换为蒸汽波美学', 'Vaporwave', '蒸汽波'],
      ['Convert to claymation stop-motion', '转换为粘土定格动画', 'Claymation', '粘土动画'],
      ['Convert to low poly 3D art', '转换为低多边形3D艺术', 'Low Poly', '低多边形'],
    ],
  },
  {
    id: 'convert', en: 'Photo Convert', zh: '真人互转',
    prompts: [
      ['Convert the anime character to a realistic photograph of a real person', '将动漫角色转换为真实人物照片', 'Anime → Real', '动漫→真人'],
      ['Transform the illustrated character into a photorealistic portrait', '将插画角色转换为写实照片肖像', 'Illustration → Real', '插画→真人'],
      ['Convert the cartoon face to a real human face with natural skin', '将卡通面孔转换为有自然皮肤的真人面孔', 'Cartoon → Real', '卡通→真人'],
      ['Transform the 3D cartoon character to photo-real', '将3D卡通角色转换为照片写实', '3D → Real', '3D→真人'],
      ['Convert the photo to Studio Ghibli anime character', '将照片转换为吉卜力动漫角色', 'Real → Ghibli', '真人→吉卜力'],
      ['Transform the person into a Disney animated character', '将人物转换为迪士尼动画角色', 'Real → Disney', '真人→迪士尼'],
      ['Convert the photo to chibi super-deformed anime', '将照片转换为Q版超变形动漫', 'Real → Chibi', '真人→Q版'],
      ['Transform the person into a Pixar 3D cartoon character', '将人物转换为皮克斯3D卡通角色', 'Real → Pixar', '真人→皮克斯'],
      ['Convert the portrait to shonen anime art style', '将肖像转换为少年动漫画风', 'Real → Anime', '真人→动漫'],
      ['Convert the portrait to Chinese donghua animation style', '将肖像转换为中国动画风格', 'Real → Donghua', '真人→国漫'],
      ['Transform the person into a Korean webtoon character', '将人物转换为韩国网漫角色', 'Real → Webtoon', '真人→网漫'],
      ['Transform the person into an oil painting Renaissance portrait', '将人物转换为文艺复兴油画肖像', 'Real → Oil Paint', '真人→油画'],
      ['Convert the photo to watercolor portrait illustration', '将照片转换为水彩肖像插画', 'Real → Watercolor', '真人→水彩'],
      ['Convert the portrait to Chinese ink wash painting', '将肖像转换为中国水墨画', 'Real → Ink Wash', '真人→水墨'],
    ],
  },
  {
    id: 'pose', en: 'Pose & View', zh: '姿势与视角',
    prompts: [
      ['Change the person pose to sitting down', '把人物姿势改为坐姿', 'Sitting', '坐姿'],
      ['Change the person pose to standing with arms crossed', '把人物姿势改为双臂交叉站立', 'Arms Crossed', '双臂交叉'],
      ['Change the person pose to waving at the camera', '把人物姿势改为向镜头挥手', 'Waving', '挥手'],
      ['Change the person pose to looking over the shoulder', '把人物姿势改为回头看', 'Over Shoulder', '回头看'],
      ['Change the person pose to hands on hips power pose', '把人物姿势改为双手叉腰', 'Power Pose', '叉腰'],
      ['Turn the character to face the camera directly', '让角色转向正面面对镜头', 'Front View', '正面'],
      ['Turn the character to show the left profile', '让角色转向展示左侧面', 'Left Profile', '左侧面'],
      ['Turn the character to show the right profile', '让角色转向展示右侧面', 'Right Profile', '右侧面'],
      ['Turn the character to face three-quarter angle to the left', '让角色转向左侧四分之三角度', '3/4 Angle', '四分之三'],
      ['Change to a close-up headshot framing', '改为特写头像构图', 'Close-up', '特写'],
      ['Change to a medium shot waist-up framing', '改为中景腰部以上构图', 'Medium Shot', '中景'],
      ['Change to a full-body wide shot framing', '改为全身远景构图', 'Full Body', '全身'],
    ],
  },
];

interface AvatarQuickPickerProps {
  onSelect: (prompt: SelectedPrompt) => void;
  onDeselect: (key: string) => void;
  selectedKeys: Set<string>;
}

export const AvatarQuickPicker: React.FC<AvatarQuickPickerProps> = ({ onSelect, onDeselect, selectedKeys }) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';

  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const toggleCat = useCallback((id: string) => {
    setExpandedCat((prev) => (prev === id ? null : id));
  }, []);

  const handleChipClick = useCallback((catId: string, idx: number, p: QuickPrompt) => {
    const key = `q-${catId}-${idx}`;
    if (selectedKeys.has(key)) {
      onDeselect(key);
    } else {
      onSelect({ key, en: p[0], zh: p[1] });
    }
  }, [selectedKeys, onSelect, onDeselect]);

  return (
    <BoxAny sx={{ mb: 0.5 }}>
      {/* Category chips row */}
      <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: expandedCat ? 0.75 : 0 }}>
        {categories.map((cat) => (
          <Chip
            key={cat.id}
            label={isZh ? cat.zh : cat.en}
            size="small"
            variant={expandedCat === cat.id ? 'filled' : 'outlined'}
            color={expandedCat === cat.id ? 'secondary' : 'default'}
            onClick={() => toggleCat(cat.id)}
            sx={{ fontSize: '0.7rem' }}
          />
        ))}
      </BoxAny>

      {/* Expanded prompt chips */}
      {expandedCat && (() => {
        const cat = categories.find((c) => c.id === expandedCat);
        if (!cat) return null;
        return (
          <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, p: 0.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            {cat.prompts.map((p, idx) => {
              const key = `q-${cat.id}-${idx}`;
              const sel = selectedKeys.has(key);
              return (
                <Chip
                  key={key}
                  label={isZh ? p[3] : p[2]}
                  size="small"
                  variant={sel ? 'filled' : 'outlined'}
                  color={sel ? 'primary' : 'default'}
                  onClick={() => handleChipClick(cat.id, idx, p)}
                  sx={{ fontSize: '0.7rem' }}
                />
              );
            })}
          </BoxAny>
        );
      })()}
    </BoxAny>
  );
};
