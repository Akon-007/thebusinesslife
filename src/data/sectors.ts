/**
 * The business sectors a player chooses between when creating their company.
 *
 * This list is a client contract: the administrator portal can describe a
 * sector or switch it off, but it cannot invent or rename one, because a
 * company's sector is stored by name and is reported on across the platform.
 */

export const SECTORS = [
  'Fashion & Apparel',
  'Food & Beverage',
  'Technology',
  'Retail & Trading',
  'Logistics & Transport',
  'Beauty & Wellness',
  'Agriculture',
  'Real Estate',
  'Entertainment & Media',
  'Education & Training',
]

/**
 * What each sector means in the simulation. An administrator can replace any of
 * these, and the replacement is what a new player reads.
 */
export const SECTOR_BRIEFINGS: Record<string, string> = {
  'Fashion & Apparel': 'Clothing, tailoring and accessories. Seasonal demand, heavy competition on price.',
  'Food & Beverage': 'Cooking, packaging and selling food. Thin margins, but everyone eats.',
  'Technology': 'Software, devices and digital services. Slow to build, quick to scale.',
  'Retail & Trading': 'Buying and reselling goods. Cash-flow driven, and where most traders start.',
  'Logistics & Transport': 'Moving goods and people across the city. Fuel, traffic and reliability decide it.',
  'Beauty & Wellness': 'Salons, grooming and personal care. Repeat customers, strong word of mouth.',
  'Agriculture': 'Farming, processing and food supply. Long cycles and weather risk.',
  'Real Estate': 'Renting, developing and managing property. Large amounts of capital, slow returns.',
  'Entertainment & Media': 'Music, content and events. Attention is the product.',
  'Education & Training': 'Teaching, tutoring and skills programmes. Trust and outcomes drive growth.',
}
