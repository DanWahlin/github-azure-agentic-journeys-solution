import type { Product } from '../models/product.js';
import type { Order } from '../models/order.js';
import type { User } from '../models/user.js';

/**
 * Deterministic seed timestamp so re-seeding produces stable rows.
 */
const SEED_TS = '2026-01-01T00:00:00.000Z';

export const SEED_USERS: User[] = [
  {
    id: 'user-buyer-1',
    email: 'alex@example.com',
    name: 'Alex Johnson',
    role: 'buyer',
    createdAt: SEED_TS,
  },
  {
    id: 'user-seller-1',
    email: 'jordan@example.com',
    name: 'Jordan Lee',
    role: 'seller',
    createdAt: SEED_TS,
  },
];

function img(id: string): string {
  return `https://images.unsplash.com/${id}?w=400&h=300&fit=crop`;
}

interface SeedProductSpec {
  id: string;
  name: string;
  category: Product['category'];
  price: number;
  inventory: number;
  rating: number;
  tags: string[];
  description: string;
  shortDescription: string;
  imageId: string;
}

/**
 * The ten canonical seed products. Image IDs were verified to return HTTP 200.
 * The prod-10 image ID (photo-1587654780291-39c9404d746b) is the validated
 * building-block photo required by the spec — do not replace it.
 */
const SEED_PRODUCT_SPECS: SeedProductSpec[] = [
  {
    id: 'prod-1',
    name: 'UltraBook Pro 15',
    category: 'Electronics',
    price: 1299.99,
    inventory: 25,
    rating: 4.7,
    tags: ['laptop', 'ultrabook', 'portable'],
    description:
      'The UltraBook Pro 15 is a lightweight 15-inch laptop computer built for professionals on the move. Featuring a full-day battery, a vivid IPS display, and a backlit keyboard, this portable computer handles everything from code to presentations without breaking a sweat.',
    shortDescription: 'Lightweight 15-inch ultrabook with all-day battery',
    imageId: 'photo-1589561084283-930aa7b1ce50',
  },
  {
    id: 'prod-2',
    name: 'Wireless Noise-Canceling Headphones',
    category: 'Electronics',
    price: 249.99,
    inventory: 100,
    rating: 4.5,
    tags: ['headphones', 'wireless', 'noise-canceling'],
    description:
      'Block out distractions with industry-leading active noise cancellation. These wireless headphones deliver rich, balanced sound over Bluetooth 5.2 with 30 hours of battery life. Foldable design fits easily in a backpack.',
    shortDescription: 'Wireless over-ear headphones with active noise cancellation',
    imageId: 'photo-1505740420928-5e560c06d30e',
  },
  {
    id: 'prod-3',
    name: 'Trail Runner X200',
    category: 'Sports',
    price: 129.99,
    inventory: 60,
    rating: 4.3,
    tags: ['running', 'shoes', 'trail'],
    description:
      'Designed for rugged terrain, the Trail Runner X200 features aggressive lugs for grip, a rock plate for protection, and a breathable mesh upper. Ideal for trail runs, hiking, and obstacle courses.',
    shortDescription: 'Rugged trail running shoes with aggressive grip',
    imageId: 'photo-1542291026-7eec264c27ff',
  },
  {
    id: 'prod-4',
    name: 'Organic Cotton Crew Neck',
    category: 'Clothing',
    price: 34.99,
    inventory: 200,
    rating: 4.1,
    tags: ['t-shirt', 'organic', 'cotton'],
    description:
      'Made from 100% GOTS-certified organic cotton, this crew neck tee is soft, breathable, and built to last. Pre-shrunk fabric and reinforced stitching mean it holds its shape wash after wash.',
    shortDescription: 'Soft organic cotton t-shirt, pre-shrunk and durable',
    imageId: 'photo-1521572163474-6864f9cf17ab',
  },
  {
    id: 'prod-5',
    name: 'Smart Home Hub',
    category: 'Electronics',
    price: 89.99,
    inventory: 75,
    rating: 4.4,
    tags: ['smart-home', 'hub', 'voice-control'],
    description:
      'Control your lights, thermostat, and locks with voice commands or the companion app. The Smart Home Hub supports Zigbee, Z-Wave, and Wi-Fi devices and works with Alexa and Google Assistant out of the box.',
    shortDescription: 'Voice-controlled smart home hub with multi-protocol support',
    imageId: 'photo-1558089687-f282ffcbc126',
  },
  {
    id: 'prod-6',
    name: 'Ceramic Pour-Over Set',
    category: 'Home',
    price: 45.99,
    inventory: 40,
    rating: 4.8,
    tags: ['coffee', 'pour-over', 'ceramic'],
    description:
      'Hand-thrown ceramic dripper and server set for pour-over coffee enthusiasts. The ribbed interior promotes even extraction while the double-wall server keeps your brew warm. Dishwasher safe.',
    shortDescription: 'Handcrafted ceramic pour-over coffee dripper and server',
    imageId: 'photo-1495474472287-4d71bcdd2085',
  },
  {
    id: 'prod-7',
    name: 'Pro Django',
    category: 'Books',
    price: 39.99,
    inventory: 150,
    rating: 4.6,
    tags: ['programming', 'python', 'django'],
    description:
      'Master Django from models to deployment. Covers the ORM, class-based views, REST APIs with Django REST Framework, authentication, testing, and production deployment with Docker and CI/CD pipelines.',
    shortDescription: 'Complete Django guide from models to production deployment',
    imageId: 'photo-1544716278-ca5e3f4abd8c',
  },
  {
    id: 'prod-8',
    name: 'Yoga Mat Premium',
    category: 'Sports',
    price: 59.99,
    inventory: 80,
    rating: 4.2,
    tags: ['yoga', 'mat', 'exercise'],
    description:
      'Extra-thick 6mm natural rubber mat with a non-slip textured surface on both sides. Alignment lines help with pose positioning. Includes a carrying strap. Free from PVC, latex, and heavy metals.',
    shortDescription: 'Extra-thick 6mm natural rubber yoga mat with alignment lines',
    imageId: 'photo-1544367567-0f2fcb009e0b',
  },
  {
    id: 'prod-9',
    name: 'Winter Puffer Jacket',
    category: 'Clothing',
    price: 189.99,
    inventory: 35,
    rating: 4.5,
    tags: ['jacket', 'winter', 'puffer'],
    description:
      'Stay warm in sub-zero temperatures with this 700-fill-power down puffer jacket. Water-resistant shell, elastic cuffs, and a detachable hood keep the cold out. Packs into its own pocket for travel.',
    shortDescription: '700-fill down puffer jacket, water-resistant and packable',
    imageId: 'photo-1544923246-77307dd654cb',
  },
  {
    id: 'prod-10',
    name: 'Building Block Castle Set',
    category: 'Toys',
    price: 49.99,
    inventory: 90,
    rating: 4.9,
    tags: ['building', 'blocks', 'kids'],
    description:
      'Build a medieval castle with 850 interlocking pieces including turrets, a drawbridge, and 6 knight minifigures. Compatible with all major building block brands. Recommended for ages 6 and up.',
    shortDescription: '850-piece castle building set with 6 knight minifigures',
    imageId: 'photo-1587654780291-39c9404d746b',
  },
];

export const SEED_PRODUCTS: Product[] = SEED_PRODUCT_SPECS.map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  shortDescription: s.shortDescription,
  price: s.price,
  category: s.category,
  tags: s.tags,
  inventory: s.inventory,
  rating: s.rating,
  reviewCount: 0,
  imageUrl: img(s.imageId),
  sellerId: 'user-seller-1',
  status: 'active',
  createdAt: SEED_TS,
  updatedAt: SEED_TS,
}));

/**
 * Pre-loaded historical orders. These do NOT decrement product inventory —
 * the inventory values above represent current stock.
 */
export const SEED_ORDERS: Order[] = [
  {
    id: 'order-1',
    userId: 'user-buyer-1',
    items: [
      { productId: 'prod-1', quantity: 1, priceAtPurchase: 1299.99 },
      { productId: 'prod-6', quantity: 2, priceAtPurchase: 45.99 },
    ],
    total: 1391.97,
    status: 'confirmed',
    shippingAddress: {
      street: '123 Main St',
      city: 'Seattle',
      state: 'WA',
      zip: '98101',
      country: 'US',
    },
    createdAt: SEED_TS,
  },
  {
    id: 'order-2',
    userId: 'user-buyer-1',
    items: [{ productId: 'prod-4', quantity: 3, priceAtPurchase: 34.99 }],
    total: 104.97,
    status: 'pending',
    shippingAddress: {
      street: '123 Main St',
      city: 'Seattle',
      state: 'WA',
      zip: '98101',
      country: 'US',
    },
    createdAt: SEED_TS,
  },
];
