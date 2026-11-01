  // ======================================================================
  // Sound library + browser: 400+ sampled instruments, drum kits, presets
  // ======================================================================
  const CATALOG = {"waf":[["0000_GeneralUserGS_sf2_file","Acoustic Grand Piano","GeneralUser GS","keys",0,0],["0001_GeneralUserGS_sf2_file","Acoustic Grand Piano 2","GeneralUser GS","keys",0,0],["0002_GeneralUserGS_sf2_file","Acoustic Grand Piano 3","GeneralUser GS","keys",0,0],["0003_GeneralUserGS_sf2_file","Acoustic Grand Piano 4","GeneralUser GS","keys",0,0],["0010_GeneralUserGS_sf2_file","Bright Acoustic Piano","GeneralUser GS","keys",1,0],["0011_GeneralUserGS_sf2_file","Bright Acoustic Piano 2","GeneralUser GS","keys",1,0],["0012_GeneralUserGS_sf2_file","Bright Acoustic Piano 3","GeneralUser GS","keys",1,0],["0020_GeneralUserGS_sf2_file","Electric Grand Piano","GeneralUser GS","keys",2,0],["0021_GeneralUserGS_sf2_file","Electric Grand Piano 2","GeneralUser GS","keys",2,0],["0030_GeneralUserGS_sf2_file","Honky-tonk Piano","GeneralUser GS","keys",3,0],["0031_GeneralUserGS_sf2_file","Honky-tonk Piano 2","GeneralUser GS","keys",3,0],["0040_GeneralUserGS_sf2_file","Electric Piano 1","GeneralUser GS","keys",4,0],["0041_GeneralUserGS_sf2_file","Electric Piano 1 2","GeneralUser GS","keys",4,0],["0042_GeneralUserGS_sf2_file","Electric Piano 1 3","GeneralUser GS","keys",4,0],["0043_GeneralUserGS_sf2_file","Electric Piano 1 4","GeneralUser GS","keys",4,0],["0044_GeneralUserGS_sf2_file","Electric Piano 1 5","GeneralUser GS","keys",4,0],["0045_GeneralUserGS_sf2_file","Electric Piano 1 6","GeneralUser GS","keys",4,0],["0046_GeneralUserGS_sf2_file","Electric Piano 1 7","GeneralUser GS","keys",4,0],["0040_FluidR3_GM_sf2_file","Electric Piano 1","FluidR3","keys",4,0],["0050_GeneralUserGS_sf2_file","Electric Piano 2","GeneralUser GS","keys",5,0],["0051_GeneralUserGS_sf2_file","Electric Piano 2 2","GeneralUser GS","keys",5,0],["0052_GeneralUserGS_sf2_file","Electric Piano 2 3","GeneralUser GS","keys",5,0],["0053_GeneralUserGS_sf2_file","Electric Piano 2 4","GeneralUser GS","keys",5,0],["0054_GeneralUserGS_sf2_file","Electric Piano 2 5","GeneralUser GS","keys",5,0],["0050_FluidR3_GM_sf2_file","Electric Piano 2","FluidR3","keys",5,0],["0060_GeneralUserGS_sf2_file","Harpsichord","GeneralUser GS","keys",6,0],["0061_GeneralUserGS_sf2_file","Harpsichord 2","GeneralUser GS","keys",6,0],["0062_GeneralUserGS_sf2_file","Harpsichord 3","GeneralUser GS","keys",6,0],["0060_FluidR3_GM_sf2_file","Harpsichord","FluidR3","keys",6,0],["0070_GeneralUserGS_sf2_file","Clavinet","GeneralUser GS","keys",7,0],["0071_GeneralUserGS_sf2_file","Clavinet 2","GeneralUser GS","keys",7,0],["0070_FluidR3_GM_sf2_file","Clavinet","FluidR3","keys",7,0],["0080_GeneralUserGS_sf2_file","Celesta","GeneralUser GS","bells",8,0],["0081_GeneralUserGS_sf2_file","Celesta 2","GeneralUser GS","bells",8,0],["0080_FluidR3_GM_sf2_file","Celesta","FluidR3","bells",8,0],["0090_GeneralUserGS_sf2_file","Glockenspiel","GeneralUser GS","bells",9,0],["0090_FluidR3_GM_sf2_file","Glockenspiel","FluidR3","bells",9,0],["0100_GeneralUserGS_sf2_file","Music Box","GeneralUser GS","bells",10,0],["0101_GeneralUserGS_sf2_file","Music Box 2","GeneralUser GS","bells",10,0],["0100_FluidR3_GM_sf2_file","Music Box","FluidR3","bells",10,0],["0110_GeneralUserGS_sf2_file","Vibraphone","GeneralUser GS","bells",11,0],["0110_FluidR3_GM_sf2_file","Vibraphone","FluidR3","bells",11,0],["0120_GeneralUserGS_sf2_file","Marimba","GeneralUser GS","bells",12,0],["0121_GeneralUserGS_sf2_file","Marimba 2","GeneralUser GS","bells",12,0],["0120_FluidR3_GM_sf2_file","Marimba","FluidR3","bells",12,0],["0130_GeneralUserGS_sf2_file","Xylophone","GeneralUser GS","bells",13,0],["0130_FluidR3_GM_sf2_file","Xylophone","FluidR3","bells",13,0],["0140_GeneralUserGS_sf2_file","Tubular Bells","GeneralUser GS","bells",14,0],["0141_GeneralUserGS_sf2_file","Tubular Bells 2","GeneralUser GS","bells",14,0],["0142_GeneralUserGS_sf2_file","Tubular Bells 3","GeneralUser GS","bells",14,0],["0143_GeneralUserGS_sf2_file","Tubular Bells 4","GeneralUser GS","bells",14,0],["0140_FluidR3_GM_sf2_file","Tubular Bells","FluidR3","bells",14,0],["0150_GeneralUserGS_sf2_file","Dulcimer","GeneralUser GS","bells",15,0],["0150_FluidR3_GM_sf2_file","Dulcimer","FluidR3","bells",15,0],["0160_GeneralUserGS_sf2_file","Drawbar Organ","GeneralUser GS","keys",16,1],["0160_FluidR3_GM_sf2_file","Drawbar Organ","FluidR3","keys",16,1],["0170_GeneralUserGS_sf2_file","Percussive Organ","GeneralUser GS","keys",17,1],["0171_GeneralUserGS_sf2_file","Percussive Organ 2","GeneralUser GS","keys",17,1],["0170_FluidR3_GM_sf2_file","Percussive Organ","FluidR3","keys",17,1],["0180_GeneralUserGS_sf2_file","Rock Organ","GeneralUser GS","keys",18,1],["0181_GeneralUserGS_sf2_file","Rock Organ 2","GeneralUser GS","keys",18,1],["0180_FluidR3_GM_sf2_file","Rock Organ","FluidR3","keys",18,1],["0190_GeneralUserGS_sf2_file","Church Organ","GeneralUser GS","keys",19,1],["0191_GeneralUserGS_sf2_file","Church Organ 2","GeneralUser GS","keys",19,1],["0190_FluidR3_GM_sf2_file","Church Organ","FluidR3","keys",19,1],["0200_GeneralUserGS_sf2_file","Reed Organ","GeneralUser GS","keys",20,1],["0201_GeneralUserGS_sf2_file","Reed Organ 2","GeneralUser GS","keys",20,1],["0210_GeneralUserGS_sf2_file","Accordion","GeneralUser GS","keys",21,1],["0211_GeneralUserGS_sf2_file","Accordion 2","GeneralUser GS","keys",21,1],["0212_GeneralUserGS_sf2_file","Accordion 3","GeneralUser GS","keys",21,1],["0220_GeneralUserGS_sf2_file","Harmonica","GeneralUser GS","keys",22,1],["0230_GeneralUserGS_sf2_file","Tango Accordion","GeneralUser GS","keys",23,1],["0231_GeneralUserGS_sf2_file","Tango Accordion 2","GeneralUser GS","keys",23,1],["0240_GeneralUserGS_sf2_file","Nylon Guitar","GeneralUser GS","gtrbass",24,0],["0241_GeneralUserGS_sf2_file","Nylon Guitar 2","GeneralUser GS","gtrbass",24,0],["0250_GeneralUserGS_sf2_file","Steel Guitar","GeneralUser GS","gtrbass",25,0],["0251_GeneralUserGS_sf2_file","Steel Guitar 2","GeneralUser GS","gtrbass",25,0],["0252_GeneralUserGS_sf2_file","Steel Guitar 3","GeneralUser GS","gtrbass",25,0],["0253_GeneralUserGS_sf2_file","Steel Guitar 4","GeneralUser GS","gtrbass",25,0],["0254_GeneralUserGS_sf2_file","Steel Guitar 5","GeneralUser GS","gtrbass",25,0],["0255_GeneralUserGS_sf2_file","Steel Guitar 6","GeneralUser GS","gtrbass",25,0],["0250_Acoustic_Guitar_sf2_file","Steel Guitar","Acoustic Guitar","gtrbass",25,0],["0251_Acoustic_Guitar_sf2_file","Steel Guitar 2","Acoustic Guitar","gtrbass",25,0],["0252_Acoustic_Guitar_sf2_file","Steel Guitar 3","Acoustic Guitar","gtrbass",25,0],["0254_Acoustic_Guitar_sf2_file","Steel Guitar 5","Acoustic Guitar","gtrbass",25,0],["0260_GeneralUserGS_sf2_file","Jazz Guitar","GeneralUser GS","gtrbass",26,0],["0261_GeneralUserGS_sf2_file","Jazz Guitar 2","GeneralUser GS","gtrbass",26,0],["0260_Stratocaster_sf2_file","Jazz Guitar","Stratocaster","gtrbass",26,0],["0261_Stratocaster_sf2_file","Jazz Guitar 2","Stratocaster","gtrbass",26,0],["0262_Stratocaster_sf2_file","Jazz Guitar 3","Stratocaster","gtrbass",26,0],["0270_GeneralUserGS_sf2_file","Clean Guitar","GeneralUser GS","gtrbass",27,0],["0271_GeneralUserGS_sf2_file","Clean Guitar 2","GeneralUser GS","gtrbass",27,0],["0270_Gibson_Les_Paul_sf2_file","Clean Guitar","Les Paul","gtrbass",27,0],["0270_Stratocaster_sf2_file","Clean Guitar","Stratocaster","gtrbass",27,0],["0271_Stratocaster_sf2_file","Clean Guitar 2","Stratocaster","gtrbass",27,0],["0272_Stratocaster_sf2_file","Clean Guitar 3","Stratocaster","gtrbass",27,0],["0280_GeneralUserGS_sf2_file","Muted Guitar","GeneralUser GS","gtrbass",28,0],["0281_GeneralUserGS_sf2_file","Muted Guitar 2","GeneralUser GS","gtrbass",28,0],["0282_GeneralUserGS_sf2_file","Muted Guitar 3","GeneralUser GS","gtrbass",28,0],["0283_GeneralUserGS_sf2_file","Muted Guitar 4","GeneralUser GS","gtrbass",28,0],["0290_GeneralUserGS_sf2_file","Overdriven Guitar","GeneralUser GS","gtrbass",29,0],["0300_GeneralUserGS_sf2_file","Distortion Guitar","GeneralUser GS","gtrbass",30,0],["0301_GeneralUserGS_sf2_file","Distortion Guitar 2","GeneralUser GS","gtrbass",30,0],["0302_GeneralUserGS_sf2_file","Distortion Guitar 3","GeneralUser GS","gtrbass",30,0],["0310_GeneralUserGS_sf2_file","Guitar Harmonics","GeneralUser GS","gtrbass",31,0],["0311_GeneralUserGS_sf2_file","Guitar Harmonics 2","GeneralUser GS","gtrbass",31,0],["0320_GeneralUserGS_sf2_file","Acoustic Bass","GeneralUser GS","gtrbass",32,0],["0321_GeneralUserGS_sf2_file","Acoustic Bass 2","GeneralUser GS","gtrbass",32,0],["0322_GeneralUserGS_sf2_file","Acoustic Bass 3","GeneralUser GS","gtrbass",32,0],["0330_GeneralUserGS_sf2_file","Finger Bass","GeneralUser GS","gtrbass",33,0],["0331_GeneralUserGS_sf2_file","Finger Bass 2","GeneralUser GS","gtrbass",33,0],["0332_GeneralUserGS_sf2_file","Finger Bass 3","GeneralUser GS","gtrbass",33,0],["0340_GeneralUserGS_sf2_file","Pick Bass","GeneralUser GS","gtrbass",34,0],["0341_GeneralUserGS_sf2_file","Pick Bass 2","GeneralUser GS","gtrbass",34,0],["0350_GeneralUserGS_sf2_file","Fretless Bass","GeneralUser GS","gtrbass",35,0],["0351_GeneralUserGS_sf2_file","Fretless Bass 2","GeneralUser GS","gtrbass",35,0],["0360_GeneralUserGS_sf2_file","Slap Bass 1","GeneralUser GS","gtrbass",36,0],["0361_GeneralUserGS_sf2_file","Slap Bass 1 2","GeneralUser GS","gtrbass",36,0],["0370_GeneralUserGS_sf2_file","Slap Bass 2","GeneralUser GS","gtrbass",37,0],["0371_GeneralUserGS_sf2_file","Slap Bass 2 2","GeneralUser GS","gtrbass",37,0],["0372_GeneralUserGS_sf2_file","Slap Bass 2 3","GeneralUser GS","gtrbass",37,0],["0380_GeneralUserGS_sf2_file","Synth Bass 1","GeneralUser GS","gtrbass",38,0],["0381_GeneralUserGS_sf2_file","Synth Bass 1 2","GeneralUser GS","gtrbass",38,0],["0382_GeneralUserGS_sf2_file","Synth Bass 1 3","GeneralUser GS","gtrbass",38,0],["0383_GeneralUserGS_sf2_file","Synth Bass 1 4","GeneralUser GS","gtrbass",38,0],["0384_GeneralUserGS_sf2_file","Synth Bass 1 5","GeneralUser GS","gtrbass",38,0],["0385_GeneralUserGS_sf2_file","Synth Bass 1 6","GeneralUser GS","gtrbass",38,0],["0386_GeneralUserGS_sf2_file","Synth Bass 1 7","GeneralUser GS","gtrbass",38,0],["0387_GeneralUserGS_sf2_file","Synth Bass 1 8","GeneralUser GS","gtrbass",38,0],["0390_GeneralUserGS_sf2_file","Synth Bass 2","GeneralUser GS","gtrbass",39,0],["0391_GeneralUserGS_sf2_file","Synth Bass 2 2","GeneralUser GS","gtrbass",39,0],["0392_GeneralUserGS_sf2_file","Synth Bass 2 3","GeneralUser GS","gtrbass",39,0],["0393_GeneralUserGS_sf2_file","Synth Bass 2 4","GeneralUser GS","gtrbass",39,0],["0400_GeneralUserGS_sf2_file","Violin","GeneralUser GS","strings",40,1],["0401_GeneralUserGS_sf2_file","Violin 2","GeneralUser GS","strings",40,1],["0402_GeneralUserGS_sf2_file","Violin 3","GeneralUser GS","strings",40,1],["0400_FluidR3_GM_sf2_file","Violin","FluidR3","strings",40,1],["0410_GeneralUserGS_sf2_file","Viola","GeneralUser GS","strings",41,1],["0410_FluidR3_GM_sf2_file","Viola","FluidR3","strings",41,1],["0420_GeneralUserGS_sf2_file","Cello","GeneralUser GS","strings",42,1],["0421_GeneralUserGS_sf2_file","Cello 2","GeneralUser GS","strings",42,1],["0420_FluidR3_GM_sf2_file","Cello","FluidR3","strings",42,1],["0430_GeneralUserGS_sf2_file","Contrabass","GeneralUser GS","strings",43,1],["0430_FluidR3_GM_sf2_file","Contrabass","FluidR3","strings",43,1],["0440_GeneralUserGS_sf2_file","Tremolo Strings","GeneralUser GS","strings",44,1],["0441_GeneralUserGS_sf2_file","Tremolo Strings 2","GeneralUser GS","strings",44,1],["0442_GeneralUserGS_sf2_file","Tremolo Strings 3","GeneralUser GS","strings",44,1],["0440_FluidR3_GM_sf2_file","Tremolo Strings","FluidR3","strings",44,1],["0450_GeneralUserGS_sf2_file","Pizzicato Strings","GeneralUser GS","strings",45,1],["0450_FluidR3_GM_sf2_file","Pizzicato Strings","FluidR3","strings",45,1],["0460_GeneralUserGS_sf2_file","Orchestral Harp","GeneralUser GS","strings",46,0],["0460_FluidR3_GM_sf2_file","Orchestral Harp","FluidR3","strings",46,0],["0470_GeneralUserGS_sf2_file","Timpani","GeneralUser GS","perc",47,0],["0471_GeneralUserGS_sf2_file","Timpani 2","GeneralUser GS","perc",47,0],["0470_FluidR3_GM_sf2_file","Timpani","FluidR3","perc",47,0],["0480_GeneralUserGS_sf2_file","String Ensemble 1","GeneralUser GS","strings",48,1],["0489_GeneralUserGS_sf2_file","String Ensemble 1 10","GeneralUser GS","strings",48,1],["0481_GeneralUserGS_sf2_file","String Ensemble 1 2","GeneralUser GS","strings",48,1],["0482_GeneralUserGS_sf2_file","String Ensemble 1 3","GeneralUser GS","strings",48,1],["0483_GeneralUserGS_sf2_file","String Ensemble 1 4","GeneralUser GS","strings",48,1],["0484_GeneralUserGS_sf2_file","String Ensemble 1 5","GeneralUser GS","strings",48,1],["0485_GeneralUserGS_sf2_file","String Ensemble 1 6","GeneralUser GS","strings",48,1],["0486_GeneralUserGS_sf2_file","String Ensemble 1 7","GeneralUser GS","strings",48,1],["0487_GeneralUserGS_sf2_file","String Ensemble 1 8","GeneralUser GS","strings",48,1],["0488_GeneralUserGS_sf2_file","String Ensemble 1 9","GeneralUser GS","strings",48,1],["0480_FluidR3_GM_sf2_file","String Ensemble 1","FluidR3","strings",48,1],["0490_GeneralUserGS_sf2_file","String Ensemble 2","GeneralUser GS","strings",49,1],["0491_GeneralUserGS_sf2_file","String Ensemble 2 2","GeneralUser GS","strings",49,1],["0492_GeneralUserGS_sf2_file","String Ensemble 2 3","GeneralUser GS","strings",49,1],["0490_FluidR3_GM_sf2_file","String Ensemble 2","FluidR3","strings",49,1],["0500_GeneralUserGS_sf2_file","Synth Strings 1","GeneralUser GS","strings",50,1],["0501_GeneralUserGS_sf2_file","Synth Strings 1 2","GeneralUser GS","strings",50,1],["0502_GeneralUserGS_sf2_file","Synth Strings 1 3","GeneralUser GS","strings",50,1],["0500_FluidR3_GM_sf2_file","Synth Strings 1","FluidR3","strings",50,1],["0510_GeneralUserGS_sf2_file","Synth Strings 2","GeneralUser GS","strings",51,1],["0511_GeneralUserGS_sf2_file","Synth Strings 2 2","GeneralUser GS","strings",51,1],["0510_FluidR3_GM_sf2_file","Synth Strings 2","FluidR3","strings",51,1],["0520_GeneralUserGS_sf2_file","Choir Aahs","GeneralUser GS","strings",52,1],["0520_FluidR3_GM_sf2_file","Choir Aahs","FluidR3","strings",52,1],["0520_Soul_Ahhs_sf2_file","Choir Aahs","Soul Ahhs","strings",52,1],["0521_Soul_Ahhs_sf2_file","Choir Aahs 2","Soul Ahhs","strings",52,1],["0522_Soul_Ahhs_sf2_file","Choir Aahs 3","Soul Ahhs","strings",52,1],["0530_GeneralUserGS_sf2_file","Voice Oohs","GeneralUser GS","strings",53,1],["0531_GeneralUserGS_sf2_file","Voice Oohs 2","GeneralUser GS","strings",53,1],["0530_FluidR3_GM_sf2_file","Voice Oohs","FluidR3","strings",53,1],["0530_Soul_Ahhs_sf2_file","Voice Oohs","Soul Ahhs","strings",53,1],["0540_GeneralUserGS_sf2_file","Synth Voice","GeneralUser GS","strings",54,1],["0540_FluidR3_GM_sf2_file","Synth Voice","FluidR3","strings",54,1],["0550_GeneralUserGS_sf2_file","Orchestra Hit","GeneralUser GS","strings",55,1],["0550_FluidR3_GM_sf2_file","Orchestra Hit","FluidR3","strings",55,1],["0560_GeneralUserGS_sf2_file","Trumpet","GeneralUser GS","winds",56,1],["0570_GeneralUserGS_sf2_file","Trombone","GeneralUser GS","winds",57,1],["0571_GeneralUserGS_sf2_file","Trombone 2","GeneralUser GS","winds",57,1],["0580_GeneralUserGS_sf2_file","Tuba","GeneralUser GS","winds",58,1],["0581_GeneralUserGS_sf2_file","Tuba 2","GeneralUser GS","winds",58,1],["0590_GeneralUserGS_sf2_file","Muted Trumpet","GeneralUser GS","winds",59,1],["0591_GeneralUserGS_sf2_file","Muted Trumpet 2","GeneralUser GS","winds",59,1],["0600_GeneralUserGS_sf2_file","French Horn","GeneralUser GS","winds",60,1],["0601_GeneralUserGS_sf2_file","French Horn 2","GeneralUser GS","winds",60,1],["0602_GeneralUserGS_sf2_file","French Horn 3","GeneralUser GS","winds",60,1],["0603_GeneralUserGS_sf2_file","French Horn 4","GeneralUser GS","winds",60,1],["0610_GeneralUserGS_sf2_file","Brass Section","GeneralUser GS","winds",61,1],["0611_GeneralUserGS_sf2_file","Brass Section 2","GeneralUser GS","winds",61,1],["0612_GeneralUserGS_sf2_file","Brass Section 3","GeneralUser GS","winds",61,1],["0613_GeneralUserGS_sf2_file","Brass Section 4","GeneralUser GS","winds",61,1],["0614_GeneralUserGS_sf2_file","Brass Section 5","GeneralUser GS","winds",61,1],["0615_GeneralUserGS_sf2_file","Brass Section 6","GeneralUser GS","winds",61,1],["0620_GeneralUserGS_sf2_file","Synth Brass 1","GeneralUser GS","winds",62,1],["0621_GeneralUserGS_sf2_file","Synth Brass 1 2","GeneralUser GS","winds",62,1],["0622_GeneralUserGS_sf2_file","Synth Brass 1 3","GeneralUser GS","winds",62,1],["0630_GeneralUserGS_sf2_file","Synth Brass 2","GeneralUser GS","winds",63,1],["0631_GeneralUserGS_sf2_file","Synth Brass 2 2","GeneralUser GS","winds",63,1],["0640_GeneralUserGS_sf2_file","Soprano Sax","GeneralUser GS","winds",64,1],["0650_GeneralUserGS_sf2_file","Alto Sax","GeneralUser GS","winds",65,1],["0660_GeneralUserGS_sf2_file","Tenor Sax","GeneralUser GS","winds",66,1],["0661_GeneralUserGS_sf2_file","Tenor Sax 2","GeneralUser GS","winds",66,1],["0670_GeneralUserGS_sf2_file","Baritone Sax","GeneralUser GS","winds",67,1],["0680_GeneralUserGS_sf2_file","Oboe","GeneralUser GS","winds",68,1],["0690_GeneralUserGS_sf2_file","English Horn","GeneralUser GS","winds",69,1],["0700_GeneralUserGS_sf2_file","Bassoon","GeneralUser GS","winds",70,1],["0701_GeneralUserGS_sf2_file","Bassoon 2","GeneralUser GS","winds",70,1],["0710_GeneralUserGS_sf2_file","Clarinet","GeneralUser GS","winds",71,1],["0720_GeneralUserGS_sf2_file","Piccolo","GeneralUser GS","winds",72,1],["0730_GeneralUserGS_sf2_file","Flute","GeneralUser GS","winds",73,1],["0740_GeneralUserGS_sf2_file","Recorder","GeneralUser GS","winds",74,1],["0741_GeneralUserGS_sf2_file","Recorder 2","GeneralUser GS","winds",74,1],["0750_GeneralUserGS_sf2_file","Pan Flute","GeneralUser GS","winds",75,1],["0751_GeneralUserGS_sf2_file","Pan Flute 2","GeneralUser GS","winds",75,1],["0760_GeneralUserGS_sf2_file","Blown Bottle","GeneralUser GS","winds",76,1],["0761_GeneralUserGS_sf2_file","Blown Bottle 2","GeneralUser GS","winds",76,1],["0762_GeneralUserGS_sf2_file","Blown Bottle 3","GeneralUser GS","winds",76,1],["0770_GeneralUserGS_sf2_file","Shakuhachi","GeneralUser GS","winds",77,1],["0771_GeneralUserGS_sf2_file","Shakuhachi 2","GeneralUser GS","winds",77,1],["0772_GeneralUserGS_sf2_file","Shakuhachi 3","GeneralUser GS","winds",77,1],["0780_GeneralUserGS_sf2_file","Whistle","GeneralUser GS","winds",78,1],["0781_GeneralUserGS_sf2_file","Whistle 2","GeneralUser GS","winds",78,1],["0790_GeneralUserGS_sf2_file","Ocarina","GeneralUser GS","winds",79,1],["0791_GeneralUserGS_sf2_file","Ocarina 2","GeneralUser GS","winds",79,1],["0800_GeneralUserGS_sf2_file","Square Lead","GeneralUser GS","leads",80,1],["0801_GeneralUserGS_sf2_file","Square Lead 2","GeneralUser GS","leads",80,1],["0800_FluidR3_GM_sf2_file","Square Lead","FluidR3","leads",80,1],["0810_GeneralUserGS_sf2_file","Saw Lead","GeneralUser GS","leads",81,1],["0811_GeneralUserGS_sf2_file","Saw Lead 2","GeneralUser GS","leads",81,1],["0810_FluidR3_GM_sf2_file","Saw Lead","FluidR3","leads",81,1],["0820_GeneralUserGS_sf2_file","Calliope Lead","GeneralUser GS","leads",82,1],["0821_GeneralUserGS_sf2_file","Calliope Lead 2","GeneralUser GS","leads",82,1],["0822_GeneralUserGS_sf2_file","Calliope Lead 3","GeneralUser GS","leads",82,1],["0823_GeneralUserGS_sf2_file","Calliope Lead 4","GeneralUser GS","leads",82,1],["0820_FluidR3_GM_sf2_file","Calliope Lead","FluidR3","leads",82,1],["0830_GeneralUserGS_sf2_file","Chiff Lead","GeneralUser GS","leads",83,1],["0831_GeneralUserGS_sf2_file","Chiff Lead 2","GeneralUser GS","leads",83,1],["0830_FluidR3_GM_sf2_file","Chiff Lead","FluidR3","leads",83,1],["0840_GeneralUserGS_sf2_file","Charang Lead","GeneralUser GS","leads",84,1],["0841_GeneralUserGS_sf2_file","Charang Lead 2","GeneralUser GS","leads",84,1],["0840_FluidR3_GM_sf2_file","Charang Lead","FluidR3","leads",84,1],["0850_GeneralUserGS_sf2_file","Voice Lead","GeneralUser GS","leads",85,1],["0851_GeneralUserGS_sf2_file","Voice Lead 2","GeneralUser GS","leads",85,1],["0850_FluidR3_GM_sf2_file","Voice Lead","FluidR3","leads",85,1],["0860_GeneralUserGS_sf2_file","Fifths Lead","GeneralUser GS","leads",86,1],["0860_FluidR3_GM_sf2_file","Fifths Lead","FluidR3","leads",86,1],["0870_GeneralUserGS_sf2_file","Bass + Lead","GeneralUser GS","leads",87,1],["0871_GeneralUserGS_sf2_file","Bass + Lead 2","GeneralUser GS","leads",87,1],["0872_GeneralUserGS_sf2_file","Bass + Lead 3","GeneralUser GS","leads",87,1],["0873_GeneralUserGS_sf2_file","Bass + Lead 4","GeneralUser GS","leads",87,1],["0870_FluidR3_GM_sf2_file","Bass + Lead","FluidR3","leads",87,1],["0880_GeneralUserGS_sf2_file","New Age Pad","GeneralUser GS","pads",88,1],["0889_GeneralUserGS_sf2_file","New Age Pad 10","GeneralUser GS","pads",88,1],["0881_GeneralUserGS_sf2_file","New Age Pad 2","GeneralUser GS","pads",88,1],["0882_GeneralUserGS_sf2_file","New Age Pad 3","GeneralUser GS","pads",88,1],["0883_GeneralUserGS_sf2_file","New Age Pad 4","GeneralUser GS","pads",88,1],["0884_GeneralUserGS_sf2_file","New Age Pad 5","GeneralUser GS","pads",88,1],["0885_GeneralUserGS_sf2_file","New Age Pad 6","GeneralUser GS","pads",88,1],["0886_GeneralUserGS_sf2_file","New Age Pad 7","GeneralUser GS","pads",88,1],["0887_GeneralUserGS_sf2_file","New Age Pad 8","GeneralUser GS","pads",88,1],["0888_GeneralUserGS_sf2_file","New Age Pad 9","GeneralUser GS","pads",88,1],["0880_FluidR3_GM_sf2_file","New Age Pad","FluidR3","pads",88,1],["0880_JCLive_sf2_file","New Age Pad","JCLive","pads",88,1],["0880_Chaos_sf2_file","New Age Pad","Chaos","pads",88,1],["0890_GeneralUserGS_sf2_file","Warm Pad","GeneralUser GS","pads",89,1],["0891_GeneralUserGS_sf2_file","Warm Pad 2","GeneralUser GS","pads",89,1],["0890_FluidR3_GM_sf2_file","Warm Pad","FluidR3","pads",89,1],["0890_JCLive_sf2_file","Warm Pad","JCLive","pads",89,1],["0890_Chaos_sf2_file","Warm Pad","Chaos","pads",89,1],["0900_GeneralUserGS_sf2_file","Polysynth Pad","GeneralUser GS","pads",90,1],["0901_GeneralUserGS_sf2_file","Polysynth Pad 2","GeneralUser GS","pads",90,1],["0900_FluidR3_GM_sf2_file","Polysynth Pad","FluidR3","pads",90,1],["0900_JCLive_sf2_file","Polysynth Pad","JCLive","pads",90,1],["0900_Chaos_sf2_file","Polysynth Pad","Chaos","pads",90,1],["0910_GeneralUserGS_sf2_file","Choir Pad","GeneralUser GS","pads",91,1],["0911_GeneralUserGS_sf2_file","Choir Pad 2","GeneralUser GS","pads",91,1],["0910_FluidR3_GM_sf2_file","Choir Pad","FluidR3","pads",91,1],["0910_JCLive_sf2_file","Choir Pad","JCLive","pads",91,1],["0910_Chaos_sf2_file","Choir Pad","Chaos","pads",91,1],["0920_GeneralUserGS_sf2_file","Bowed Pad","GeneralUser GS","pads",92,1],["0921_GeneralUserGS_sf2_file","Bowed Pad 2","GeneralUser GS","pads",92,1],["0920_FluidR3_GM_sf2_file","Bowed Pad","FluidR3","pads",92,1],["0920_JCLive_sf2_file","Bowed Pad","JCLive","pads",92,1],["0920_Chaos_sf2_file","Bowed Pad","Chaos","pads",92,1],["0930_GeneralUserGS_sf2_file","Metallic Pad","GeneralUser GS","pads",93,1],["0931_GeneralUserGS_sf2_file","Metallic Pad 2","GeneralUser GS","pads",93,1],["0930_FluidR3_GM_sf2_file","Metallic Pad","FluidR3","pads",93,1],["0930_JCLive_sf2_file","Metallic Pad","JCLive","pads",93,1],["0930_Chaos_sf2_file","Metallic Pad","Chaos","pads",93,1],["0940_GeneralUserGS_sf2_file","Halo Pad","GeneralUser GS","pads",94,1],["0941_GeneralUserGS_sf2_file","Halo Pad 2","GeneralUser GS","pads",94,1],["0940_FluidR3_GM_sf2_file","Halo Pad","FluidR3","pads",94,1],["0940_JCLive_sf2_file","Halo Pad","JCLive","pads",94,1],["0940_Chaos_sf2_file","Halo Pad","Chaos","pads",94,1],["0950_GeneralUserGS_sf2_file","Sweep Pad","GeneralUser GS","pads",95,1],["0951_GeneralUserGS_sf2_file","Sweep Pad 2","GeneralUser GS","pads",95,1],["0950_FluidR3_GM_sf2_file","Sweep Pad","FluidR3","pads",95,1],["0950_JCLive_sf2_file","Sweep Pad","JCLive","pads",95,1],["0950_Chaos_sf2_file","Sweep Pad","Chaos","pads",95,1],["0960_GeneralUserGS_sf2_file","Rain FX","GeneralUser GS","pads",96,1],["0961_GeneralUserGS_sf2_file","Rain FX 2","GeneralUser GS","pads",96,1],["0962_GeneralUserGS_sf2_file","Rain FX 3","GeneralUser GS","pads",96,1],["0960_FluidR3_GM_sf2_file","Rain FX","FluidR3","pads",96,1],["0960_JCLive_sf2_file","Rain FX","JCLive","pads",96,1],["0960_Chaos_sf2_file","Rain FX","Chaos","pads",96,1],["0970_GeneralUserGS_sf2_file","Soundtrack FX","GeneralUser GS","pads",97,1],["0971_GeneralUserGS_sf2_file","Soundtrack FX 2","GeneralUser GS","pads",97,1],["0970_FluidR3_GM_sf2_file","Soundtrack FX","FluidR3","pads",97,1],["0970_JCLive_sf2_file","Soundtrack FX","JCLive","pads",97,1],["0970_Chaos_sf2_file","Soundtrack FX","Chaos","pads",97,1],["0980_GeneralUserGS_sf2_file","Crystal FX","GeneralUser GS","pads",98,1],["0981_GeneralUserGS_sf2_file","Crystal FX 2","GeneralUser GS","pads",98,1],["0982_GeneralUserGS_sf2_file","Crystal FX 3","GeneralUser GS","pads",98,1],["0983_GeneralUserGS_sf2_file","Crystal FX 4","GeneralUser GS","pads",98,1],["0984_GeneralUserGS_sf2_file","Crystal FX 5","GeneralUser GS","pads",98,1],["0980_FluidR3_GM_sf2_file","Crystal FX","FluidR3","pads",98,1],["0980_JCLive_sf2_file","Crystal FX","JCLive","pads",98,1],["0980_Chaos_sf2_file","Crystal FX","Chaos","pads",98,1],["0990_GeneralUserGS_sf2_file","Atmosphere FX","GeneralUser GS","pads",99,1],["0991_GeneralUserGS_sf2_file","Atmosphere FX 2","GeneralUser GS","pads",99,1],["0990_FluidR3_GM_sf2_file","Atmosphere FX","FluidR3","pads",99,1],["0990_JCLive_sf2_file","Atmosphere FX","JCLive","pads",99,1],["0990_Chaos_sf2_file","Atmosphere FX","Chaos","pads",99,1],["1000_GeneralUserGS_sf2_file","Brightness FX","GeneralUser GS","pads",100,1],["1001_GeneralUserGS_sf2_file","Brightness FX 2","GeneralUser GS","pads",100,1],["1002_GeneralUserGS_sf2_file","Brightness FX 3","GeneralUser GS","pads",100,1],["1000_FluidR3_GM_sf2_file","Brightness FX","FluidR3","pads",100,1],["1000_JCLive_sf2_file","Brightness FX","JCLive","pads",100,1],["1000_Chaos_sf2_file","Brightness FX","Chaos","pads",100,1],["1010_GeneralUserGS_sf2_file","Goblins FX","GeneralUser GS","pads",101,1],["1010_FluidR3_GM_sf2_file","Goblins FX","FluidR3","pads",101,1],["1010_JCLive_sf2_file","Goblins FX","JCLive","pads",101,1],["1010_Chaos_sf2_file","Goblins FX","Chaos","pads",101,1],["1020_GeneralUserGS_sf2_file","Echoes FX","GeneralUser GS","pads",102,1],["1021_GeneralUserGS_sf2_file","Echoes FX 2","GeneralUser GS","pads",102,1],["1022_GeneralUserGS_sf2_file","Echoes FX 3","GeneralUser GS","pads",102,1],["1020_FluidR3_GM_sf2_file","Echoes FX","FluidR3","pads",102,1],["1020_JCLive_sf2_file","Echoes FX","JCLive","pads",102,1],["1020_Chaos_sf2_file","Echoes FX","Chaos","pads",102,1],["1030_GeneralUserGS_sf2_file","Sci-fi FX","GeneralUser GS","pads",103,1],["1031_GeneralUserGS_sf2_file","Sci-fi FX 2","GeneralUser GS","pads",103,1],["1030_FluidR3_GM_sf2_file","Sci-fi FX","FluidR3","pads",103,1],["1030_JCLive_sf2_file","Sci-fi FX","JCLive","pads",103,1],["1030_Chaos_sf2_file","Sci-fi FX","Chaos","pads",103,1],["1040_GeneralUserGS_sf2_file","Sitar","GeneralUser GS","world",104,0],["1041_GeneralUserGS_sf2_file","Sitar 2","GeneralUser GS","world",104,0],["1050_GeneralUserGS_sf2_file","Banjo","GeneralUser GS","world",105,0],["1051_GeneralUserGS_sf2_file","Banjo 2","GeneralUser GS","world",105,0],["1060_GeneralUserGS_sf2_file","Shamisen","GeneralUser GS","world",106,0],["1061_GeneralUserGS_sf2_file","Shamisen 2","GeneralUser GS","world",106,0],["1070_GeneralUserGS_sf2_file","Koto","GeneralUser GS","world",107,0],["1071_GeneralUserGS_sf2_file","Koto 2","GeneralUser GS","world",107,0],["1072_GeneralUserGS_sf2_file","Koto 3","GeneralUser GS","world",107,0],["1073_GeneralUserGS_sf2_file","Koto 4","GeneralUser GS","world",107,0],["1080_GeneralUserGS_sf2_file","Kalimba","GeneralUser GS","world",108,0],["1090_GeneralUserGS_sf2_file","Bagpipe","GeneralUser GS","world",109,1],["1100_GeneralUserGS_sf2_file","Fiddle","GeneralUser GS","world",110,1],["1101_GeneralUserGS_sf2_file","Fiddle 2","GeneralUser GS","world",110,1],["1102_GeneralUserGS_sf2_file","Fiddle 3","GeneralUser GS","world",110,1],["1110_GeneralUserGS_sf2_file","Shanai","GeneralUser GS","world",111,1],["1120_GeneralUserGS_sf2_file","Tinkle Bell","GeneralUser GS","perc",112,0],["1130_GeneralUserGS_sf2_file","Agogo","GeneralUser GS","perc",113,0],["1140_GeneralUserGS_sf2_file","Steel Drums","GeneralUser GS","perc",114,0],["1150_GeneralUserGS_sf2_file","Woodblock","GeneralUser GS","perc",115,0],["1151_GeneralUserGS_sf2_file","Woodblock 2","GeneralUser GS","perc",115,0],["1152_GeneralUserGS_sf2_file","Woodblock 3","GeneralUser GS","perc",115,0],["1160_GeneralUserGS_sf2_file","Taiko Drum","GeneralUser GS","perc",116,0],["1161_GeneralUserGS_sf2_file","Taiko Drum 2","GeneralUser GS","perc",116,0],["1162_GeneralUserGS_sf2_file","Taiko Drum 3","GeneralUser GS","perc",116,0],["1170_GeneralUserGS_sf2_file","Melodic Tom","GeneralUser GS","perc",117,0],["1171_GeneralUserGS_sf2_file","Melodic Tom 2","GeneralUser GS","perc",117,0],["1180_GeneralUserGS_sf2_file","Synth Drum","GeneralUser GS","perc",118,0],["1181_GeneralUserGS_sf2_file","Synth Drum 2","GeneralUser GS","perc",118,0],["1190_GeneralUserGS_sf2_file","Reverse Cymbal","GeneralUser GS","perc",119,0],["1191_GeneralUserGS_sf2_file","Reverse Cymbal 2","GeneralUser GS","perc",119,0],["1192_GeneralUserGS_sf2_file","Reverse Cymbal 3","GeneralUser GS","perc",119,0],["1193_GeneralUserGS_sf2_file","Reverse Cymbal 4","GeneralUser GS","perc",119,0],["1194_GeneralUserGS_sf2_file","Reverse Cymbal 5","GeneralUser GS","perc",119,0],["1200_GeneralUserGS_sf2_file","Guitar Fret Noise","GeneralUser GS","perc",120,0],["1201_GeneralUserGS_sf2_file","Guitar Fret Noise 2","GeneralUser GS","perc",120,0],["1202_GeneralUserGS_sf2_file","Guitar Fret Noise 3","GeneralUser GS","perc",120,0],["1210_GeneralUserGS_sf2_file","Breath Noise","GeneralUser GS","perc",121,0],["1211_GeneralUserGS_sf2_file","Breath Noise 2","GeneralUser GS","perc",121,0],["1212_GeneralUserGS_sf2_file","Breath Noise 3","GeneralUser GS","perc",121,0],["1220_GeneralUserGS_sf2_file","Seashore","GeneralUser GS","perc",122,0],["1221_GeneralUserGS_sf2_file","Seashore 2","GeneralUser GS","perc",122,0],["1222_GeneralUserGS_sf2_file","Seashore 3","GeneralUser GS","perc",122,0],["1223_GeneralUserGS_sf2_file","Seashore 4","GeneralUser GS","perc",122,0],["1224_GeneralUserGS_sf2_file","Seashore 5","GeneralUser GS","perc",122,0],["1225_GeneralUserGS_sf2_file","Seashore 6","GeneralUser GS","perc",122,0],["1226_GeneralUserGS_sf2_file","Seashore 7","GeneralUser GS","perc",122,0],["1230_GeneralUserGS_sf2_file","Bird Tweet","GeneralUser GS","perc",123,0],["1231_GeneralUserGS_sf2_file","Bird Tweet 2","GeneralUser GS","perc",123,0],["1232_GeneralUserGS_sf2_file","Bird Tweet 3","GeneralUser GS","perc",123,0],["1233_GeneralUserGS_sf2_file","Bird Tweet 4","GeneralUser GS","perc",123,0],["1234_GeneralUserGS_sf2_file","Bird Tweet 5","GeneralUser GS","perc",123,0],["1240_GeneralUserGS_sf2_file","Telephone Ring","GeneralUser GS","perc",124,0],["1241_GeneralUserGS_sf2_file","Telephone Ring 2","GeneralUser GS","perc",124,0],["1242_GeneralUserGS_sf2_file","Telephone Ring 3","GeneralUser GS","perc",124,0],["1243_GeneralUserGS_sf2_file","Telephone Ring 4","GeneralUser GS","perc",124,0],["1244_GeneralUserGS_sf2_file","Telephone Ring 5","GeneralUser GS","perc",124,0],["1250_GeneralUserGS_sf2_file","Helicopter","GeneralUser GS","perc",125,0],["1259_GeneralUserGS_sf2_file","Helicopter 10","GeneralUser GS","perc",125,0],["1251_GeneralUserGS_sf2_file","Helicopter 2","GeneralUser GS","perc",125,0],["1252_GeneralUserGS_sf2_file","Helicopter 3","GeneralUser GS","perc",125,0],["1253_GeneralUserGS_sf2_file","Helicopter 4","GeneralUser GS","perc",125,0],["1254_GeneralUserGS_sf2_file","Helicopter 5","GeneralUser GS","perc",125,0],["1255_GeneralUserGS_sf2_file","Helicopter 6","GeneralUser GS","perc",125,0],["1256_GeneralUserGS_sf2_file","Helicopter 7","GeneralUser GS","perc",125,0],["1257_GeneralUserGS_sf2_file","Helicopter 8","GeneralUser GS","perc",125,0],["1258_GeneralUserGS_sf2_file","Helicopter 9","GeneralUser GS","perc",125,0],["1260_GeneralUserGS_sf2_file","Applause","GeneralUser GS","perc",126,0],["1261_GeneralUserGS_sf2_file","Applause 2","GeneralUser GS","perc",126,0],["1262_GeneralUserGS_sf2_file","Applause 3","GeneralUser GS","perc",126,0],["1263_GeneralUserGS_sf2_file","Applause 4","GeneralUser GS","perc",126,0],["1264_GeneralUserGS_sf2_file","Applause 5","GeneralUser GS","perc",126,0],["1265_GeneralUserGS_sf2_file","Applause 6","GeneralUser GS","perc",126,0],["1270_GeneralUserGS_sf2_file","Gunshot","GeneralUser GS","perc",127,0],["1271_GeneralUserGS_sf2_file","Gunshot 2","GeneralUser GS","perc",127,0],["1272_GeneralUserGS_sf2_file","Gunshot 3","GeneralUser GS","perc",127,0],["1273_GeneralUserGS_sf2_file","Gunshot 4","GeneralUser GS","perc",127,0],["1274_GeneralUserGS_sf2_file","Gunshot 5","GeneralUser GS","perc",127,0]],"kits":[["brush-kit","Brush Kit"],["dance-kit","Dance Kit"],["electronic-kit","Electronic Kit"],["jazz-kit","Jazz Kit"],["orchestra-kit","Orchestra Kit"],["power-kit","Power Kit"],["room-kit","Room Kit"],["sfx-kit","SFX Kit"],["standard-kit","Standard Kit"],["tr-808-kit","TR-808 Kit"]]};
  const REMOTE_WAF = "https://surikov.github.io/webaudiofontdata/sound/";
  const LIB_CATS = [
    ["fav", "★ Favorites"], ["nb", "Nate Bloom"], ["pads", "Pads & Atmos"], ["keys", "Keys & Organ"],
    ["bells", "Bells & Mallets"], ["strings", "Strings & Choir"], ["winds", "Brass & Winds"], ["leads", "Synth Leads"],
    ["gtrbass", "Guitar & Bass"], ["world", "World"], ["perc", "Perc & FX"], ["kits", "Drum Kits"],
    ["engines", "Engines"], ["mine", "My Instruments"],
  ];
  // Nate Bloom presets: [name, engine or stack, params per engine]
  const NB_PRESETS = [
    ["Supersaw Anthem", "saw", { saw: { detune: 0.6, cutoff: 0.78, res: 0.15, attack: 0.05, release: 0.45 } }],
    ["Dark Saw Pad", "saw", { saw: { detune: 0.5, cutoff: 0.32, res: 0.1, attack: 0.6, release: 0.75 } }],
    ["Saw Pluck", "saw", { saw: { detune: 0.3, cutoff: 0.42, res: 0.35, attack: 0, release: 0.18 } }],
    ["OB Brass Stab", "analog", { analog: { cutoff: 0.3, env: 0.7, res: 0.25, attack: 0.02, release: 0.25 } }],
    ["Soft Poly", "analog", { analog: { cutoff: 0.45, env: 0.25, res: 0.15, attack: 0.3, release: 0.55 } }],
    ["Resonant Sweep", "analog", { analog: { cutoff: 0.2, env: 0.85, res: 0.75, attack: 0.45, release: 0.5 } }],
    ["Glass Morph", "vital", { vital: { morph: 0, motion: 0.3, tone: 0.6, attack: 0.45, release: 0.7 } }],
    ["Vocal Motion", "vital", { vital: { morph: 0.75, motion: 0.6, tone: 0.5, attack: 0.5, release: 0.7 } }],
    ["Bright Wavetable", "vital", { vital: { morph: 1, motion: 0.2, tone: 0.8, attack: 0.1, release: 0.4 } }],
    ["Juno Strings", "juno", { juno: { pwm: 0.5, chorus: 0.65, cutoff: 0.55, attack: 0.35, release: 0.6 } }],
    ["Juno PWM Pad", "juno", { juno: { pwm: 0.85, chorus: 0.8, cutoff: 0.45, attack: 0.6, release: 0.8 } }],
    ["Dark Juno", "juno", { juno: { pwm: 0.4, chorus: 0.5, cutoff: 0.28, attack: 0.5, release: 0.7 } }],
    ["Blade Brass", "tyrell", { tyrell: { swell: 0.45, bite: 0.4, vibrato: 0.35, attack: 0.25, release: 0.55 } }],
    ["Soft Horn Swell", "tyrell", { tyrell: { swell: 0.8, bite: 0.15, vibrato: 0.25, attack: 0.55, release: 0.6 } }],
    ["Vangelis Lead", "tyrell", { tyrell: { swell: 0.2, bite: 0.75, vibrato: 0.6, attack: 0.1, release: 0.5 } }],
    ["Aah Choir", "choir", { choir: { vowel: 0, breath: 0.25, vib: 0.3, attack: 0.55, release: 0.65 } }],
    ["Ooh Ghosts", "choir", { choir: { vowel: 1, breath: 0.5, vib: 0.45, attack: 0.7, release: 0.8 } }],
    ["Breathy Chant", "choir", { choir: { vowel: 0.5, breath: 0.8, vib: 0.15, attack: 0.4, release: 0.6 } }],
    ["Hollow Drone", "zeb", { zeb: { bright: 0.3, oddeven: 0.05, evolve: 0.35, attack: 0.6, release: 0.8 } }],
    ["Bright Evolve", "zeb", { zeb: { bright: 0.75, oddeven: 0.5, evolve: 0.75, attack: 0.5, release: 0.75 } }],
    ["Sub Hum", "zeb", { zeb: { bright: 0.1, oddeven: 0.6, evolve: 0.15, attack: 0.4, release: 0.7 } }],
    ["Kalimba", "bells", { bells: { material: 0, ring: 0.35, hardness: 0.55, shimmer: 0.1, release: 0.5 } }],
    ["Glass Bells", "bells", { bells: { material: 1, ring: 0.6, hardness: 0.45, shimmer: 0.4, release: 0.6 } }],
    ["Shimmer Bells", "bells", { bells: { material: 0.5, ring: 0.75, hardness: 0.35, shimmer: 0.8, release: 0.7 } }],
    ["Blade Runner Fog", ["juno", "tyrell", "choir"], {
      juno: { pwm: 0.5, chorus: 0.65, cutoff: 0.5, attack: 0.45, release: 0.7 },
      tyrell: { swell: 0.8, bite: 0.15, vibrato: 0.25, attack: 0.55, release: 0.6 },
      choir: { vowel: 0, breath: 0.25, vib: 0.3, attack: 0.6, release: 0.7 } }],
    ["Psych Bloom", ["bells", "zeb"], {
      bells: { material: 0.5, ring: 0.75, hardness: 0.35, shimmer: 0.8, release: 0.7 },
      zeb: { bright: 0.75, oddeven: 0.5, evolve: 0.75, attack: 0.5, release: 0.75 } }],
    ["Space Organ", ["vital", "choir"], {
      vital: { morph: 0, motion: 0.3, tone: 0.6, attack: 0.45, release: 0.7 },
      choir: { vowel: 1, breath: 0.4, vib: 0.35, attack: 0.6, release: 0.75 } }],
    ["Night Drive", ["saw", "analog"], {
      saw: { detune: 0.5, cutoff: 0.32, res: 0.1, attack: 0.6, release: 0.75 },
      analog: { cutoff: 0.45, env: 0.25, res: 0.15, attack: 0.3, release: 0.55 } }],
    ["Crystal Cave", ["bells", "vital", "zeb"], {
      bells: { material: 1, ring: 0.6, hardness: 0.45, shimmer: 0.4, release: 0.6 },
      vital: { morph: 0, motion: 0.3, tone: 0.6, attack: 0.45, release: 0.7 },
      zeb: { bright: 0.3, oddeven: 0.05, evolve: 0.35, attack: 0.6, release: 0.8 } }],
  ];

  let libInst = null;
  const libCache = new Map();
  let favs = (() => { try { const v = JSON.parse(localStorage.getItem("nightbloom-favs") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
  const saveFavs = () => { try { localStorage.setItem("nightbloom-favs", JSON.stringify(favs)); } catch (e) {} };

  // ---------- catalog ----------
  function allEntries() {
    const list = [];
    NB_PRESETS.forEach((p, i) => list.push({ id: "n:" + i, name: p[0], sub: Array.isArray(p[1]) ? "Stack · " + p[1].map(e => ENGINES[e].short).join(" + ") : ENGINES[p[1]].name, cat: "nb" }));
    CATALOG.waf.forEach(w => list.push({ id: "w:" + w[0], name: w[1], sub: w[2], cat: w[3], prog: w[4], sus: w[5] }));
    CATALOG.kits.forEach(k => list.push({ id: "k:" + k[0], name: k[1], sub: "12 pads", cat: "kits" }));
    Object.entries(ENGINES).forEach(([id, e]) => list.push({ id: "e:" + id, name: e.name, sub: e.after, cat: "engines" }));
    list.push({ id: "e:drum", name: "808 Drums", sub: "after TR-808", cat: "engines" });
    list.push({ id: "e:samp", name: "Sampler", sub: "your samples · play, grain, slice", cat: "engines" });
    list.push({ id: "e:pads", name: "Pads", sub: "12 sample pads", cat: "engines" });
    instMeta.forEach(m => list.push({ id: "m:" + m.id, name: m.name, sub: ({ sf2: "SoundFont", preset: "SFZ / DecentSampler", multi: "Samples" })[m.kind] || "Instrument", cat: "mine" }));
    return list;
  }
  const entryById = id => allEntries().find(e => e.id === id);

  // ---------- loading library instruments ----------
  async function fetchText(url) { const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }
  function parseWAF(t) {
    t = t.trim();
    if (t[0] !== "{") {
      t = t.replace(/^\s*\/\/.*$/gm, "");
      t = t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1).replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/'/g, '"');
    }
    return (JSON.parse(t).zones || []).filter(z => z.file);
  }
  // last resort: the library files are scripts that define a global, which loads without CORS
  function scriptZones(stem) {
    return new Promise((res, rej) => {
      const name = "_tone_" + stem;
      if (window[name]) return res(window[name].zones.filter(z => z.file));
      const el = document.createElement("script");
      el.src = REMOTE_WAF + stem + ".js";
      el.onload = () => { el.remove(); window[name] ? res(window[name].zones.filter(z => z.file)) : rej(new Error("empty")); };
      el.onerror = () => { el.remove(); rej(new Error("blocked")); };
      document.head.appendChild(el);
    });
  }
  function b64bytes(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  async function loadWaf(stem) {
    if (libCache.has(stem)) { const v = libCache.get(stem); libCache.delete(stem); libCache.set(stem, v); return v; }
    let zones;
    try { zones = parseWAF(await fetchText("snd/" + stem + ".json")); }
    catch (e) {
      try { zones = parseWAF(await fetchText(REMOTE_WAF + stem + ".js")); }
      catch (e2) { zones = await scriptZones(stem); }
    }
    const regions = await Promise.all(zones.map(async z => {
      const buf = await decode(b64bytes(z.file));
      const sr = z.sampleRate || 44100, loop = z.loopStart > 1 && z.loopEnd > z.loopStart;
      return {
        buf, lo: z.keyRangeLow ?? 0, hi: z.keyRangeHigh ?? 127, lov: 0, hiv: 127,
        root: ((z.originalPitch ?? 6000) - 100 * (z.coarseTune || 0) - (z.fineTune || 0)) / 100,
        tune: 0, gain: 1, pan: 0, loop, lsSec: loop ? z.loopStart / sr : 0, leSec: loop ? Math.min(buf.duration, z.loopEnd / sr) : 0,
        offsetSec: 0, keytrack: 1,
      };
    }));
    const inst = { regions };
    libCache.set(stem, inst);
    while (libCache.size > 8) libCache.delete(libCache.keys().next().value);
    return inst;
  }
  let libToken = 0;
  async function selectLib(entry, preview) {
    const tok = ++libToken, stem = entry.id.slice(2);
    state.cur = { id: entry.id, cat: entry.cat };
    setSoundText(entry.name, "Loading…");
    try {
      const inst = await loadWaf(stem);
      if (tok !== libToken) return;
      libInst = { name: entry.name, sub: entry.sub, regions: inst.regions };
      const keepP = state.lib.id === stem;
      state.lib.id = stem; state.engine = "lib";
      if (!keepP) Object.assign(state.lib.p, LIB_DEFAULTS(), { decay: entry.sus ? 1 : 0.62 });
      renderEngine(); save();
      if (preview) previewSound();
    } catch (e) {
      if (tok === libToken) setSoundText(entry.name, "Couldn't load this sound. Check your connection.");
    }
  }
  const LIB_DEFAULTS = () => Object.fromEntries(LIB_KNOBS.map(([k, , v]) => [k, v]));

  function applyPreset(i) {
    const [name, eng, params] = NB_PRESETS[i];
    const stack = Array.isArray(eng) ? eng : [eng];
    for (const id of Object.keys(ENGINES)) state.layers[id].on = stack.includes(id);
    for (const id of stack) {
      Object.assign(state.params[id], Object.fromEntries(ENGINES[id].knobs.map(([k, , v]) => [k, v])), params[id] || {});
      state.layers[id].level = 0.8;
    }
    state.engine = stack[0];
    state.cur = { id: "n:" + i, cat: "nb" };
    renderEngine(); save();
  }
  async function loadKit(slug) {
    let d = window.NB_KITS && window.NB_KITS[slug];
    if (!d) d = JSON.parse(await fetchText("snd/kit-" + slug + ".json"));
    for (let k = 0; k < NPADS; k++) {
      const p = d.pads[k];
      Object.assign(state.pads.p[k], Object.fromEntries(PAD_KNOBS.map(([key, , v]) => [key, v])));
      if (!p) { setPad(k, null); storePad(k, null, null); continue; }
      const raw = b64bytes(p.mp3), nm = d.name.replace(/ Kit$/, "") + " " + p.name;
      const buf = await decode(raw.slice(0));
      setPad(k, buf, nm); storePad(k, nm, buf, raw);
    }
    state.engine = "pads"; state.pads.sel = 0;
    state.cur = { id: "k:" + slug, cat: "kits" };
    renderEngine(); save();
  }
  function selectEngine(id) {
    if (ENGINES[id]) {
      const anyOther = Object.keys(ENGINES).some(x => x !== id && state.layers[x].on);
      if (!anyOther || !state.layers[id].on) { for (const x in state.layers) state.layers[x].on = x === id; }
    }
    state.engine = id; state.cur = { id: "e:" + id, cat: "engines" };
    renderEngine(); save();
  }
  // play a short note so you hear the sound you picked
  function previewSound() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    if (state.engine === "pads") { const k = padBuf.findIndex(Boolean); if (k >= 0) playPad(k, t); return; }
    if (state.engine === "drum") { playDrum("kick", t); playDrum("ch", t + 0.25); playDrum("snare", t + 0.5); return; }
    const e = entryById(state.cur && state.cur.id);
    const m = e && e.cat === "gtrbass" && e.prog >= 32 ? 40 : 60;
    makeNote(m).stop(t + 0.7);
  }
  async function chooseEntry(e, preview = true) {
    start();
    if (e.id.startsWith("w:")) return selectLib(e, preview);
    if (e.id.startsWith("n:")) { applyPreset(Number(e.id.slice(2))); if (preview) previewSound(); return; }
    if (e.id.startsWith("k:")) { setSoundText(e.name, "Loading kit onto Pads…"); try { await loadKit(e.id.slice(2)); if (preview) previewSound(); } catch (err) { setSoundText(e.name, "Couldn't load this kit."); } return; }
    if (e.id.startsWith("e:")) { selectEngine(e.id.slice(2)); if (preview) previewSound(); return; }
    if (e.id.startsWith("m:")) { state.engine = "inst"; state.cur = { id: e.id, cat: "mine" }; renderEngine(); save(); selectInstrument(e.id.slice(2), 0); }
  }

  // ---------- sound bar (‹ name ›) ----------
  const sndName = document.getElementById("sndName"), sndSub = document.getElementById("sndSub");
  function setSoundText(name, sub) { sndName.textContent = name; sndSub.textContent = sub; }
  function currentLabel() {
    const e = state.engine;
    if (e === "lib") return libLabel();
    if (e === "inst") return [curInst ? curInst.name : "Instrument", "My instruments · tap to browse"];
    if (e === "pads") { const c = state.cur && state.cur.id.startsWith("k:") && entryById(state.cur.id); return [c ? c.name : "Pads", padBuf[state.pads.sel] ? "P" + (state.pads.sel + 1) + " · tap wave to edit" : "12 pads · tap to browse"]; }
    if (e === "samp") return ["Sampler", sampBuf[state.samp.slot] ? (state.samp.slots[state.samp.slot].name || "S" + (state.samp.slot + 1)) + " · tap wave to edit" : "S" + (state.samp.slot + 1) + " empty · tap to load"];
    if (e === "drum") return ["808 Drums", "Tap to browse sounds"];
    const on = Object.keys(ENGINES).filter(id => state.layers[id].on);
    const c = state.cur && state.cur.id.startsWith("n:") ? NB_PRESETS[Number(state.cur.id.slice(2))] : null;
    const name = c ? c[0] : ENGINES[e] ? ENGINES[e].name : "Sound";
    return [name, (on.length > 1 ? on.length + " engines stacked" : "Nate Bloom synth") + " · tap to browse"];
  }
  function updateSoundBar() { if (libReady) { const [a, b] = currentLabel(); setSoundText(a, b); } }
  function stepSound(dir) {
    const all = allEntries().filter(x => x.cat !== "kits");
    let cat = state.cur && state.cur.cat;
    if (!cat || cat === "kits" || cat === "fav" && !favs.length) cat = "engines";
    const list = cat === "fav" ? all.filter(x => favs.includes(x.id)) : all.filter(x => x.cat === cat);
    if (!list.length) return;
    let i = list.findIndex(x => state.cur && x.id === state.cur.id);
    i = i < 0 ? 0 : (i + dir + list.length) % list.length;
    chooseEntry(list[i]);
    if (cat === "fav") state.cur.cat = "fav";
  }
  document.getElementById("sndPrev").addEventListener("click", () => stepSound(-1));
  document.getElementById("sndNext").addEventListener("click", () => stepSound(1));
  // In the sampler, the bar shows the sample's waveform: tapping it edits the sample
  // (or loads one into an empty slot). Pads: edits the selected pad if it has audio.
  document.getElementById("sndOpen").addEventListener("click", () => {
    if (state.engine === "samp") {
      if (sampBuf[state.samp.slot]) document.getElementById("editBtn").click();
      else { start(); document.getElementById("loadBtn").click(); }
      return;
    }
    if (state.engine === "pads" && padBuf[state.pads.sel]) { document.getElementById("padEdit").click(); return; }
    openBrowser();
  });


  // ---------- quick preview without switching sounds ----------
  let pvToken = 0;
  const kitCache = new Map();
  const PHRASE = [[0, 0], [4, 0.2], [7, 0.4], [12, 0.6]];
  async function kitBuffers(slug) {
    if (kitCache.has(slug)) return kitCache.get(slug);
    let d = window.NB_KITS && window.NB_KITS[slug];
    if (!d) d = JSON.parse(await fetchText("snd/kit-" + slug + ".json"));
    const bufs = await Promise.all(d.pads.map(p => p ? decode(b64bytes(p.mp3)) : null));
    kitCache.set(slug, bufs);
    return bufs;
  }
  function playBuf(buf, t, gain = 1) {
    if (!buf) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; g.gain.value = gain;
    s.connect(g).connect(fx.input); s.start(t);
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }
  async function previewEntry(e, btn) {
    start(); if (!ctx) return;
    const tok = ++pvToken, now = () => ctx.currentTime + 0.04;
    const base = e.cat === "gtrbass" && e.prog >= 32 ? 40 : 60;
    const busy = () => { btn.textContent = "…"; btn.classList.add("busy"); };
    const done = mark => { btn.textContent = mark || "▶"; btn.classList.remove("busy"); };
    try {
      if (e.id.startsWith("w:")) {
        busy();
        const inst = await loadWaf(e.id.slice(2));
        if (tok !== pvToken) return done();
        const P = Object.assign(LIB_DEFAULTS(), { decay: e.sus ? 1 : 0.62, release: 0.25 }), t = now();
        PHRASE.forEach(([d, o]) => { const v = makeInstVoice(base + d, t + o, 0.75, inst, P); if (v) v.stop(t + o + (o === 0.6 ? 0.7 : 0.3)); });
        return done();
      }
      if (e.id.startsWith("k:")) {
        busy();
        const b = await kitBuffers(e.id.slice(2));
        if (tok !== pvToken) return done();
        const t = now(), step = 0.16;
        [[0, 0], [3, 1], [1, 2], [3, 3], [0, 4], [0, 5], [1, 6], [4, 7]].forEach(([pad, n]) => playBuf(b[pad], t + n * step, 0.9));
        return done();
      }
      if (e.id.startsWith("n:") || (e.id.startsWith("e:") && ENGINES[e.id.slice(2)])) {
        let stack, params = {};
        if (e.id.startsWith("n:")) { const pr = NB_PRESETS[Number(e.id.slice(2))]; stack = Array.isArray(pr[1]) ? pr[1] : [pr[1]]; params = pr[2]; }
        else stack = [e.id.slice(2)];
        const t = now(), mix = 1.0 / Math.sqrt(stack.length);
        for (const id of stack) {
          const keep = state.params[id];
          state.params[id] = params[id] ? Object.assign(Object.fromEntries(ENGINES[id].knobs.map(([k, , v]) => [k, v])), params[id]) : keep;
          // voices read their settings when they start, so the real settings come straight back
          PHRASE.forEach(([d, o]) => makeVoice(base + d, id, mix, t + o).stop(t + o + (o === 0.6 ? 0.7 : 0.3)));
          state.params[id] = keep;
        }
        return done();
      }
      if (e.id === "e:drum") { const t = now(); ["kick", "ch", "snare", "ch", "kick", "kick", "snare", "oh"].forEach((d, n) => playDrum(d, t + n * 0.16)); return done(); }
      if (e.id === "e:pads") { const t = now(); padBuf.filter(Boolean).slice(0, 6).forEach((b, n) => playBuf(b, t + n * 0.18)); return done(); }
      if (e.id === "e:samp") {
        const t = now();
        PHRASE.forEach(([d, o]) => { const v = makeSampleVoice(base + d, state.samp.slot, t + o); if (v) v.stop(t + o + 0.35); });
        return done();
      }
    } catch (err) { done("!"); }
  }

  // ---------- browser ----------
  const brEl = document.getElementById("browser"), brList = document.getElementById("brList"), brCats = document.getElementById("brCats");
  const brSearch = document.getElementById("brSearch");
  let brCat = "nb", kitArm = null;
  LIB_CATS.forEach(([id, label]) => {
    const b = document.createElement("button");
    b.className = "chip"; b.dataset.cat = id; b.textContent = label;
    b.addEventListener("click", () => { brCat = id; brSearch.value = ""; renderBrowser(true); });
    brCats.appendChild(b);
  });
  function openBrowser() {
    start();
    const c = state.cur && state.cur.cat;
    brCat = c && LIB_CATS.some(x => x[0] === c) ? c : "nb";
    brSearch.value = ""; kitArm = null;
    brEl.hidden = false;
    renderBrowser(true);
  }
  function closeBrowser() {
    brEl.hidden = true; document.getElementById("brDone").textContent = "Done";
    if (pickFor != null) { pickFor = null; openLayers(); }
    updateSoundBar();
  }
  document.getElementById("brDone").addEventListener("click", closeBrowser);
  brSearch.addEventListener("input", () => renderBrowser(true));
  function renderBrowser(scrollToSel) {
    const q = brSearch.value.trim().toLowerCase();
    brCats.querySelectorAll(".chip").forEach(b => {
      b.setAttribute("aria-pressed", String(!q && b.dataset.cat === brCat));
      b.hidden = pickFor != null && ["nb", "kits", "engines", "mine"].includes(b.dataset.cat);
    });
    const all = allEntries();
    let list = q ? all.filter(e => (e.name + " " + e.sub).toLowerCase().includes(q))
      : brCat === "fav" ? all.filter(e => favs.includes(e.id)) : all.filter(e => e.cat === brCat);
    if (pickFor != null) list = list.filter(e => e.id.startsWith("w:"));
    brList.innerHTML = "";
    if (!list.length) {
      const p = document.createElement("p"); p.className = "br-empty";
      p.textContent = q ? "No sounds match “" + brSearch.value + "”." : brCat === "fav" ? "Tap ☆ on any sound to keep it here." : brCat === "mine" ? "Load your own instruments in the Inst tab." : "Nothing here yet.";
      brList.appendChild(p); return;
    }
    let selEl = null;
    for (const e of list.slice(0, 400)) {
      const row = document.createElement("div"); row.className = "br-row"; row.dataset.id = e.id;
      const cur = state.cur && state.cur.id === e.id;
      if (cur) { row.classList.add("on"); selEl = row; }
      const main = document.createElement("button"); main.className = "br-main";
      const nm = document.createElement("span"); nm.className = "br-name"; nm.textContent = e.name;
      const sb = document.createElement("span"); sb.className = "br-sub";
      sb.textContent = kitArm === e.id ? "Tap again to replace pads P1–P12" : e.sub + (q ? " · " + (LIB_CATS.find(c => c[0] === e.cat) || ["", ""])[1] : "");
      main.append(nm, sb);
      main.addEventListener("click", async () => {
        if (pickFor != null) {
          if (!e.id.startsWith("w:")) return;
          const pi = pickFor; closeBrowser(); assignPart(pi, e, true); return;
        }
        if (e.id.startsWith("k:") && kitArm !== e.id) { kitArm = e.id; renderBrowser(false); return; }
        kitArm = null;
        brList.querySelectorAll(".br-row.on").forEach(r => r.classList.remove("on"));
        row.classList.add("on");
        if (e.id.startsWith("w:")) sb.textContent = "Loading…";
        await chooseEntry(e);
        sb.textContent = e.sub;
      });
      const star = document.createElement("button"); star.className = "br-star";
      const isFav = favs.includes(e.id);
      star.textContent = isFav ? "★" : "☆"; star.setAttribute("aria-label", (isFav ? "Remove " : "Add ") + e.name + (isFav ? " from" : " to") + " favorites");
      star.classList.toggle("fav", isFav);
      star.addEventListener("click", () => {
        favs = favs.includes(e.id) ? favs.filter(x => x !== e.id) : [...favs, e.id];
        saveFavs(); renderBrowser(false);
      });
      if (!e.id.startsWith("m:") && !["e:inst", "e:lib"].includes(e.id)) {
        const play = document.createElement("button"); play.className = "br-play";
        play.textContent = "▶"; play.setAttribute("aria-label", "Hear " + e.name);
        play.addEventListener("click", () => previewEntry(e, play));
        row.append(play);
      }
      row.append(main, star);
      brList.appendChild(row);
    }
    if (scrollToSel) { if (selEl) selEl.scrollIntoView({ block: "center" }); else brList.scrollTop = 0; }
  }

  // ---------- Library engine panel ----------
  function renderLibPanel() {
    document.getElementById("engineLabel").textContent = "Library";
    noteMsg(libInst ? libInst.name + " · " + libInst.sub : "Tap the sound name above to pick from the library");
    engineKnobsEl.innerHTML = "";
    LIB_KNOBS.forEach(([k, label]) => makeKnob(engineKnobsEl, k, label, () => state.lib.p, () => {}));
  }
  {
    const wrap = document.createElement("div"); wrap.className = "tabwrap";
    const b = document.createElement("button");
    b.className = "tab"; b.dataset.engine = "lib";
    b.innerHTML = `Lib<small>library</small>`;
    b.addEventListener("click", () => {
      if (!libInst) { openBrowser(); if (!state.cur || !state.cur.id.startsWith("w:")) { brCat = "pads"; renderBrowser(true); } return; }
      state.engine = "lib"; renderEngine(); save();
    });
    wrap.append(b);
    tabsEl.insertBefore(wrap, tabsEl.firstChild);
  }
  function melodicVoices(m, when, scale = 1) {
    const e = ["drum", "pads"].includes(state.engine) ? (state.melodic || "saw") : state.engine;
    if (e === "samp") { const v = makeSampleVoice(m, state.samp.slot, when, scale); return v ? [v] : []; }
    if (e === "inst") { const v = makeInstVoice(m, when, scale); return v ? [v] : []; }
    if (e === "lib") return libVoices(m, when, scale);
    return layerVoices(m, when, scale);
  }
  function libStartup() {
    if (state.lib.id) {
      const e = entryById("w:" + state.lib.id);
      if (e) {
        const keepEngine = state.engine;
        loadWaf(state.lib.id).then(inst => {
          libInst = { name: e.name, sub: e.sub, regions: inst.regions };
          if (keepEngine === "lib") renderEngine();
        }).catch(() => { if (state.engine === "lib") setSoundText(e.name, "Couldn't load this sound. Check your connection."); });
      }
    }
  }

