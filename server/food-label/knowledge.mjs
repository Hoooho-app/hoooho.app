// Reviewed 2026-10-05. This is an evidence catalogue, never a generated recipe.
// Explicit aliases describe label facts; candidates are usable ONLY with a
// relevant active personal allergy, and cannot create ingredients or red tags.
export const evidenceSources={
  fda:'https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies',
  fsa:'https://www.gov.uk/government/publications/allergen-guidance-for-food-businesses/allergen-guidance-for-food-businesses',
  derivatives:'https://www.fda.gov/media/117410/download?attachment=',
  sources:'https://www.fda.gov/media/78205/download',
  wheat:'https://www.foodallergy.org/living-food-allergies/food-allergy-essentials/common-allergens/wheat',
  milkQualifier:'https://www.cuh.nhs.uk/patient-information/milk-allergy/',
  milkProteins:'https://www.nhs.uk/baby/breastfeeding-and-bottle-feeding/bottle-feeding/types-of-formula/',
  eggProteins:'https://pubmed.ncbi.nlm.nih.gov/4008088/',
  gelatinIdentity:'https://www.cfs.gov.hk/sc_chi/multimedia/multimedia_pub/files/FSF35_2009-6-17.pdf',
}
// A family diagnosis and a diagnosis of one constituent are not equivalent.
// Source material contains its constituents; isolated constituents do not
// establish the presence of every other protein in the same family.
export const constituentMatching={
  milk:{generic:['牛奶','牛乳','生牛乳','乳','奶','乳及乳制品','乳制品','dairy products','milk','乳蛋白','milk protein'],whole:['牛奶','牛乳','生牛乳','milk','奶粉','milk powder','skimmed milk powder','dried whole milk','全脂奶粉','脱脂奶粉','脱脂乳粉','lactose-free milk','lactose free milk','无乳糖牛奶','无乳糖牛乳'],components:[['乳清','乳清粉','脱盐乳清粉','乳清蛋白粉','whey','whey powder'],['casein','酪蛋白','酪蛋白酸钠','sodium caseinate'],['乳糖','lactose']],source:evidenceSources.milkProteins},
  egg:{generic:['鸡蛋','蛋','egg','eggs','全蛋粉','egg powder'],whole:['鸡蛋','蛋','egg','eggs','全蛋粉','egg powder'],components:[['egg white','蛋清'],['egg yolk','蛋黄'],['ovalbumin','卵白蛋白']],source:evidenceSources.eggProteins},
}
export const additionalAllergens={
  celery:['celery','celeriac','芹菜','根芹'],
  mustard:['mustard','mustard seed','芥末','芥菜籽','芥子'],
  lupin:['lupin','lupine','羽扇豆'],
  molluscs:['molluscs','mollusks','软体动物','squid','鱿鱼','oyster','牡蛎','mussel','贻贝','scallop','扇贝','clam','蛤蜊'],
  rye:['rye','rye flour','黑麦','黑麦粉'],
  barley:['barley','barley malt','大麦','大麦麦芽'],
  oats:['oats','oat','oat flour','燕麦','燕麦粉'],
}
// Reviewed identity aliases are independent of the common-allergen catalogue.
// This does not classify gelatin as a common allergen or infer its raw source.
export const exactIngredientSynonyms=[{names:['明胶','gelatin','gelatine'],source:evidenceSources.gelatinIdentity}]
// Regulatory sulphite thresholds are not inferred from a name/photo. Sulphite
// hypersensitivity/intolerance is not treated as an allergy family; an actual
// confirmed personal allergy to the exact named substance remains matchable.
export const possibleAssociations=[
  {names:['面包','bread','breadcrumbs','bread crumbs','面包屑'],allergens:['wheat'],kind:'unexpanded',source:evidenceSources.wheat},
  {names:['明胶','gelatin','gelatine'],allergens:['fish'],personalNames:['牛肉','beef','猪肉','pork'],kind:'source',source:evidenceSources.sources},
  {names:['植物油','vegetable oil'],allergens:['soy','peanut'],kind:'source',source:evidenceSources.sources},
  {names:['卵磷脂','lecithin'],allergens:['soy','egg'],kind:'source',source:evidenceSources.sources},
  {names:['水解植物蛋白','hydrolysed vegetable protein','hydrolyzed vegetable protein'],allergens:['soy','wheat','peanut'],kind:'source',source:evidenceSources.sources},
]
