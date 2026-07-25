import type { DietaryRequirement, RecipeInput } from "@eatme/shared";

export type StarterRecipe = RecipeInput & { key: string };

const vegan: DietaryRequirement[] = [
  "vegan",
  "vegetarian",
  "pescatarian",
  "dairy_free",
  "egg_free",
  "nut_free",
];

export const STARTER_RECIPES: StarterRecipe[] = [
  {
    key: "tomato_basil_pasta",
    name: "Tomato and basil pasta",
    url: null,
    ingredients: ["pasta", "tomato", "onion", "garlic", "basil"],
    dietaryTags: vegan,
    notes:
      "Soften chopped onion in oil, add garlic and tomatoes, then simmer for 15 minutes. Toss with cooked pasta and basil. Check packaged ingredients against your dietary needs.",
  },
  {
    key: "chickpea_curry",
    name: "Chickpea curry",
    url: null,
    ingredients: ["chickpea", "tomato", "onion", "garlic", "curry powder", "rice"],
    dietaryTags: [...vegan, "gluten_free"],
    notes:
      "Soften onion, add garlic and curry powder, then stir in tomatoes and chickpeas. Simmer for 20 minutes and serve with rice. Check spice blends against your dietary needs.",
  },
  {
    key: "lentil_vegetable_soup",
    name: "Lentil and vegetable soup",
    url: null,
    ingredients: ["lentil", "carrot", "onion", "celery", "tomato", "stock"],
    dietaryTags: [...vegan, "gluten_free"],
    notes:
      "Soften the chopped vegetables, add lentils, tomatoes and stock, then simmer until the lentils are tender. Use a gluten-free stock if required.",
  },
  {
    key: "vegetable_stir_fry",
    name: "Vegetable stir-fry",
    url: null,
    ingredients: ["pepper", "broccoli", "carrot", "mushroom", "noodles", "soy sauce"],
    dietaryTags: vegan,
    notes:
      "Stir-fry sliced vegetables over high heat, add cooked noodles and soy sauce, then toss until hot. Use tamari and suitable noodles if you need it gluten-free.",
  },
  {
    key: "jacket_potato_beans",
    name: "Jacket potato with beans",
    url: null,
    ingredients: ["potato", "baked beans"],
    dietaryTags: [...vegan, "gluten_free"],
    notes:
      "Bake the potato until crisp outside and soft inside. Split and top with hot baked beans. Check the bean sauce label for your dietary needs.",
  },
  {
    key: "mushroom_risotto",
    name: "Mushroom risotto",
    url: null,
    ingredients: ["risotto rice", "mushroom", "onion", "garlic", "stock", "parmesan"],
    dietaryTags: ["vegetarian", "pescatarian", "gluten_free", "egg_free", "nut_free"],
    notes:
      "Soften onion, garlic and mushrooms. Stir in rice, then add hot stock a ladle at a time until creamy. Finish with parmesan. Use suitable stock if gluten-free.",
  },
  {
    key: "spanish_omelette",
    name: "Spanish omelette",
    url: null,
    ingredients: ["egg", "potato", "onion"],
    dietaryTags: ["vegetarian", "pescatarian", "gluten_free", "dairy_free", "nut_free"],
    notes:
      "Cook thinly sliced potato and onion gently until tender. Add beaten eggs and cook until set, finishing the top under the grill if needed.",
  },
  {
    key: "salmon_traybake",
    name: "Salmon and vegetable traybake",
    url: null,
    ingredients: ["salmon", "potato", "broccoli", "lemon"],
    dietaryTags: ["pescatarian", "gluten_free", "dairy_free", "egg_free", "nut_free"],
    notes:
      "Roast bite-size potatoes until nearly tender. Add salmon, broccoli and lemon, then roast until the fish is opaque and flakes easily.",
  },
  {
    key: "fish_pie",
    name: "Fish pie",
    url: null,
    ingredients: ["white fish", "potato", "milk", "butter", "flour", "peas"],
    dietaryTags: ["pescatarian", "egg_free", "nut_free"],
    notes:
      "Poach the fish, make a thick white sauce, then combine with peas. Top with mashed potato and bake until bubbling and golden.",
  },
  {
    key: "chicken_traybake",
    name: "Chicken and vegetable traybake",
    url: null,
    ingredients: ["chicken", "potato", "pepper", "onion", "garlic"],
    dietaryTags: ["gluten_free", "dairy_free", "egg_free", "nut_free"],
    notes:
      "Roast the chopped vegetables and chicken together until browned and the chicken is cooked through. Check that the thickest piece reaches a safe temperature.",
  },
  {
    key: "spaghetti_bolognese",
    name: "Spaghetti bolognese",
    url: null,
    ingredients: ["beef mince", "spaghetti", "tomato", "onion", "carrot", "garlic"],
    dietaryTags: ["dairy_free", "egg_free", "nut_free"],
    notes:
      "Brown the mince, soften the vegetables, add tomatoes and simmer for at least 25 minutes. Serve with cooked spaghetti. Check pasta labels where needed.",
  },
  {
    key: "cottage_pie",
    name: "Cottage pie",
    url: null,
    ingredients: ["beef mince", "potato", "onion", "carrot", "peas", "stock"],
    dietaryTags: ["egg_free", "nut_free"],
    notes:
      "Brown the mince with onion and carrot, add stock and peas, then simmer. Top with mashed potato and bake until browned. Check stock and sauce labels.",
  },
];

export function recipeMeetsRequirements(
  dietaryTags: DietaryRequirement[],
  requirements: DietaryRequirement[],
): boolean {
  return requirements.every((requirement) => {
    if (requirement === "pescatarian") {
      return dietaryTags.some((tag) => ["pescatarian", "vegetarian", "vegan"].includes(tag));
    }
    if (requirement === "vegetarian") {
      return dietaryTags.includes("vegetarian") || dietaryTags.includes("vegan");
    }
    return dietaryTags.includes(requirement);
  });
}
