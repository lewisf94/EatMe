# Food guidance and sources

EatMe includes a curated local rules table for storage location, category and estimated best-quality dates. It works without an internet connection. Open Food Facts category tags can help identify a barcode item, but they do not supply EatMe's storage or date guidance.

## How automatic guidance works

- The purchase date is the date the item is added. Receipt imports use the purchase date read from the receipt when one is available.
- A date entered from the pack always wins.
- An inferred date is stored as a `best_before` quality reminder and marked `date_estimated`. It is never presented as a manufacturer use-by date.
- Rules with insufficiently reliable guidance do not generate a date. The item is placed in `Other food` and the app asks the user to check the pack.
- A user's explicit category or location choice wins over the suggestion.
- The matched rule is saved with the product, so it remains stable if the product or category is later renamed.
- The same resolver is used by manual entry, barcode entry, receipt confirmation, adding another pack and shopping-list repurchases.

This is safer than treating a broad food category as a legal expiry date. In UK labelling, a use-by date concerns safety and is determined for the specific product; a best-before date concerns quality. Storage conditions, packaging, preparation and the manufacturer's instructions can all change the correct period.

## Research method

A dated rule is included only when at least two authoritative sources agree on the storage location and support the selected range. When sources provide a range, EatMe uses a conservative value within that range. UK guidance takes priority where it is stricter, such as using refrigerated leftovers within 48 hours.

The local table currently contains 59 ordered food rules. Specific rules run before general ones, and exclusions prevent matches such as apple juice being treated as fresh apples. Unmatched food gets no estimated date.

## Sources

| Source | Used for |
|---|---|
| [USDA FSIS FoodKeeper dataset](https://catalog.data.gov/dataset/fsis-foodkeeper-data) | Public-domain storage and freshness data covering more than 650 foods and drinks |
| [FoodSafety.gov Cold Food Storage Chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts) | Refrigerator and freezer guidance for meat, poultry, seafood, eggs and leftovers |
| [FDA Refrigerator & Freezer Storage Chart](https://www.fda.gov/media/74435/download) | Independent federal cross-check for cold-storage ranges |
| [North Dakota State University Food Storage Guide](https://www.ndsu.edu/agriculture/extension/publications/food-storage-guide-answers-question) | Purchase-date guidance for cupboard, refrigerator and freezer foods |
| [Colorado State University Food Storage for Safety and Quality](https://extension.colostate.edu/resource/food-storage-for-safety-and-quality/) | Pantry, bakery, refrigerated and frozen-food ranges |
| [Penn State Extension Farmers Market Storage](https://extension.psu.edu/farmers-market-storage-postcard) | Countertop, refrigerator and crisper placement for produce |
| [WRAP date labelling and storage guidance](https://www.wrap.ngo/taking-action/food-drink/actions/date-labelling) | UK-specific storage, date-labelling and fresh-produce guidance |
| [GOV.UK best-before and use-by guidance](https://www.gov.uk/understanding-food-labelling/best-before-and-use-by-dates) | UK safety-versus-quality date meaning and leftover guidance |

The source IDs supporting each individual rule are stored alongside that rule in `apps/server/src/data/foodGuidance.ts`. Automated tests reject any dated rule with fewer than two recognised sources.

## Updating the table

Rules should remain conservative, human-readable and reviewable. When changing a duration:

1. Check at least two current authoritative sources.
2. Record their source IDs on the rule.
3. Prefer the stricter credible value when guidance differs.
4. Do not infer a use-by date.
5. Add matching and exclusion tests for ambiguous names.
