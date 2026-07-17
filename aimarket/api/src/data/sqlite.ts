import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

import { AppError } from '../errors.js';
import type { Product, ProductStatus } from '../models/product.js';
import type { Order, OrderItem, ShippingAddress } from '../models/order.js';
import type { User } from '../models/user.js';
import { roundToCents } from '../models/validation.js';
import type {
  DataStore,
  IProductRepository,
  IOrderRepository,
  IUserRepository,
  ProductListParams,
  ProductSearchFilters,
  CreateProductInput,
  UpdateProductInput,
  CreateOrderInput,
  CreateUserInput,
} from './interfaces.js';
import { SEED_PRODUCTS, SEED_ORDERS, SEED_USERS } from './seed.js';

interface ProductRow {
  id: string;
  name: string;
  description: string;
  short_description: string;
  price: number;
  category: string;
  tags: string;
  inventory: number;
  rating: number;
  review_count: number;
  image_url: string;
  seller_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface OrderRow {
  id: string;
  user_id: string;
  total: number;
  status: string;
  shipping_address: string;
  created_at: string;
}

interface OrderItemRow {
  order_id: string;
  product_id: string;
  quantity: number;
  price_at_purchase: number;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    shortDescription: row.short_description,
    price: row.price,
    category: row.category as Product['category'],
    tags: JSON.parse(row.tags) as string[],
    inventory: row.inventory,
    rating: row.rating,
    reviewCount: row.review_count,
    imageUrl: row.image_url,
    sellerId: row.seller_id,
    status: row.status as ProductStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as User['role'],
    createdAt: row.created_at,
  };
}

export function createSqliteStore(dbPath = process.env.SQLITE_DB_PATH || 'aimarket.db'): DataStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      short_description TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      inventory INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '',
      seller_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (seller_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      shipping_address TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price_at_purchase REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);

  seedIfEmpty(db);

  const products: IProductRepository = {
    async getAll(params: ProductListParams) {
      const { where, values } = buildProductFilter(params);
      const countRow = db
        .prepare(`SELECT COUNT(*) AS c FROM products ${where}`)
        .get(...values) as { c: number };
      const offset = (params.page - 1) * params.pageSize;
      const rows = db
        .prepare(
          `SELECT * FROM products ${where} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
        )
        .all(...values, params.pageSize, offset) as ProductRow[];
      return { data: rows.map(mapProduct), totalCount: countRow.c };
    },

    async getById(id: string) {
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
        | ProductRow
        | undefined;
      return row ? mapProduct(row) : null;
    },

    async create(input: CreateProductInput) {
      const now = new Date().toISOString();
      const product: Product = {
        id: randomUUID(),
        name: input.name,
        description: input.description,
        shortDescription: input.shortDescription,
        price: roundToCents(input.price),
        category: input.category,
        tags: input.tags ?? [],
        inventory: input.inventory,
        rating: input.rating ?? 0,
        reviewCount: input.reviewCount ?? 0,
        imageUrl: input.imageUrl ?? '',
        sellerId: input.sellerId,
        status: input.status ?? 'active',
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        `INSERT INTO products (id, name, description, short_description, price, category, tags,
          inventory, rating, review_count, image_url, seller_id, status, created_at, updated_at)
         VALUES (@id, @name, @description, @shortDescription, @price, @category, @tags,
          @inventory, @rating, @reviewCount, @imageUrl, @sellerId, @status, @createdAt, @updatedAt)`,
      ).run({ ...product, tags: JSON.stringify(product.tags) });
      return product;
    },

    async update(id: string, fields: UpdateProductInput) {
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
        | ProductRow
        | undefined;
      if (!existing) return null;
      const current = mapProduct(existing);

      const merged: Product = {
        ...current,
        ...('name' in fields && fields.name !== undefined ? { name: fields.name } : {}),
        ...('description' in fields && fields.description !== undefined
          ? { description: fields.description }
          : {}),
        ...('shortDescription' in fields && fields.shortDescription !== undefined
          ? { shortDescription: fields.shortDescription }
          : {}),
        ...('price' in fields && fields.price !== undefined
          ? { price: roundToCents(fields.price) }
          : {}),
        ...('category' in fields && fields.category !== undefined
          ? { category: fields.category }
          : {}),
        ...('tags' in fields && fields.tags !== undefined ? { tags: fields.tags } : {}),
        ...('inventory' in fields && fields.inventory !== undefined
          ? { inventory: fields.inventory }
          : {}),
        ...('rating' in fields && fields.rating !== undefined ? { rating: fields.rating } : {}),
        ...('reviewCount' in fields && fields.reviewCount !== undefined
          ? { reviewCount: fields.reviewCount }
          : {}),
        ...('imageUrl' in fields && fields.imageUrl !== undefined
          ? { imageUrl: fields.imageUrl }
          : {}),
        ...('status' in fields && fields.status !== undefined ? { status: fields.status } : {}),
        updatedAt: new Date().toISOString(),
      };

      db.prepare(
        `UPDATE products SET name=@name, description=@description, short_description=@shortDescription,
          price=@price, category=@category, tags=@tags, inventory=@inventory, rating=@rating,
          review_count=@reviewCount, image_url=@imageUrl, status=@status, updated_at=@updatedAt
         WHERE id=@id`,
      ).run({ ...merged, tags: JSON.stringify(merged.tags) });
      return merged;
    },

    async search(query: string, filters?: ProductSearchFilters) {
      // Local fallback: SQLite LIKE across name, description, and tags.
      const like = `%${query.trim()}%`;
      let sql =
        "SELECT * FROM products WHERE status = 'active' AND (name LIKE ? OR description LIKE ? OR short_description LIKE ? OR tags LIKE ?)";
      const values: unknown[] = [like, like, like, like];
      if (filters?.category) {
        sql += ' AND category = ?';
        values.push(filters.category);
      }
      if (filters?.minPrice != null) {
        sql += ' AND price >= ?';
        values.push(filters.minPrice);
      }
      if (filters?.maxPrice != null) {
        sql += ' AND price <= ?';
        values.push(filters.maxPrice);
      }
      sql += ' ORDER BY rating DESC, review_count DESC';
      const rows = db.prepare(sql).all(...values) as ProductRow[];
      return rows.map(mapProduct);
    },
  };

  const orders: IOrderRepository = {
    async create(input: CreateOrderInput) {
      const placeOrder = db.transaction((data: CreateOrderInput): Order => {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(data.userId) as
          | UserRow
          | undefined;
        if (!user) {
          throw AppError.validation([{ field: 'userId', message: 'User does not exist' }]);
        }

        const items: OrderItem[] = [];
        let total = 0;

        for (let i = 0; i < data.items.length; i++) {
          const line = data.items[i];
          const productRow = db.prepare('SELECT * FROM products WHERE id = ?').get(line.productId) as
            | ProductRow
            | undefined;
          if (!productRow) {
            throw AppError.validation([
              {
                field: `items[${i}].productId`,
                message: `Product ${line.productId} does not exist`,
              },
            ]);
          }
          if (productRow.status !== 'active') {
            throw AppError.validation([
              {
                field: `items[${i}].productId`,
                message: `Product ${line.productId} is not active`,
              },
            ]);
          }
          if (productRow.inventory < line.quantity) {
            throw AppError.insufficientInventory(
              `Insufficient inventory for product ${line.productId}: requested ${line.quantity}, available ${productRow.inventory}`,
            );
          }

          const priceAtPurchase = productRow.price;
          items.push({ productId: line.productId, quantity: line.quantity, priceAtPurchase });
          total = roundToCents(total + priceAtPurchase * line.quantity);
        }

        // Decrement inventory only after all lines validate.
        const decrement = db.prepare('UPDATE products SET inventory = inventory - ?, updated_at = ? WHERE id = ?');
        const nowIso = new Date().toISOString();
        for (const it of items) {
          decrement.run(it.quantity, nowIso, it.productId);
        }

        const order: Order = {
          id: randomUUID(),
          userId: data.userId,
          items,
          total,
          status: 'pending',
          shippingAddress: data.shippingAddress,
          createdAt: nowIso,
        };

        db.prepare(
          `INSERT INTO orders (id, user_id, total, status, shipping_address, created_at)
           VALUES (@id, @userId, @total, @status, @shippingAddress, @createdAt)`,
        ).run({
          id: order.id,
          userId: order.userId,
          total: order.total,
          status: order.status,
          shippingAddress: JSON.stringify(order.shippingAddress),
          createdAt: order.createdAt,
        });

        const insertItem = db.prepare(
          `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
           VALUES (?, ?, ?, ?)`,
        );
        for (const it of items) {
          insertItem.run(order.id, it.productId, it.quantity, it.priceAtPurchase);
        }

        return order;
      });

      return placeOrder(input);
    },

    async getById(id: string) {
      const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
      if (!row) return null;
      return hydrateOrder(db, row);
    },

    async getByUserId(userId: string, page: number, pageSize: number) {
      const countRow = db
        .prepare('SELECT COUNT(*) AS c FROM orders WHERE user_id = ?')
        .get(userId) as { c: number };
      const offset = (page - 1) * pageSize;
      const rows = db
        .prepare(
          'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?',
        )
        .all(userId, pageSize, offset) as OrderRow[];
      return { data: rows.map((r) => hydrateOrder(db, r)), totalCount: countRow.c };
    },
  };

  const users: IUserRepository = {
    async create(input: CreateUserInput) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(input.email);
      if (existing) throw AppError.duplicateEmail();
      const user: User = {
        id: randomUUID(),
        email: input.email,
        name: input.name,
        role: input.role,
        createdAt: new Date().toISOString(),
      };
      db.prepare(
        'INSERT INTO users (id, email, name, role, created_at) VALUES (@id, @email, @name, @role, @createdAt)',
      ).run(user);
      return user;
    },

    async getById(id: string) {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
      return row ? mapUser(row) : null;
    },

    async getByEmail(email: string) {
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
        | UserRow
        | undefined;
      return row ? mapUser(row) : null;
    },
  };

  return { products, orders, users, close: () => db.close() };
}

function buildProductFilter(params: ProductListParams): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  // status defaults to 'active'; explicit 'all' returns every status.
  const status = params.status ?? 'active';
  if (status !== 'all') {
    clauses.push('status = ?');
    values.push(status);
  }
  if (params.category) {
    clauses.push('category = ?');
    values.push(params.category);
  }
  if (params.minPrice != null) {
    clauses.push('price >= ?');
    values.push(params.minPrice);
  }
  if (params.maxPrice != null) {
    clauses.push('price <= ?');
    values.push(params.maxPrice);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, values };
}

function hydrateOrder(db: Database.Database, row: OrderRow): Order {
  const itemRows = db
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .all(row.id) as OrderItemRow[];
  return {
    id: row.id,
    userId: row.user_id,
    items: itemRows.map((it) => ({
      productId: it.product_id,
      quantity: it.quantity,
      priceAtPurchase: it.price_at_purchase,
    })),
    total: row.total,
    status: row.status as Order['status'],
    shippingAddress: JSON.parse(row.shipping_address) as ShippingAddress,
    createdAt: row.created_at,
  };
}

function seedIfEmpty(db: Database.Database): void {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number };
  if (c > 0) return;

  const seed = db.transaction(() => {
    const insertUser = db.prepare(
      'INSERT INTO users (id, email, name, role, created_at) VALUES (@id, @email, @name, @role, @createdAt)',
    );
    for (const u of SEED_USERS) insertUser.run(u);

    const insertProduct = db.prepare(
      `INSERT INTO products (id, name, description, short_description, price, category, tags,
        inventory, rating, review_count, image_url, seller_id, status, created_at, updated_at)
       VALUES (@id, @name, @description, @shortDescription, @price, @category, @tags,
        @inventory, @rating, @reviewCount, @imageUrl, @sellerId, @status, @createdAt, @updatedAt)`,
    );
    for (const p of SEED_PRODUCTS) {
      insertProduct.run({ ...p, tags: JSON.stringify(p.tags) });
    }

    const insertOrder = db.prepare(
      `INSERT INTO orders (id, user_id, total, status, shipping_address, created_at)
       VALUES (@id, @userId, @total, @status, @shippingAddress, @createdAt)`,
    );
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
       VALUES (?, ?, ?, ?)`,
    );
    for (const o of SEED_ORDERS) {
      insertOrder.run({
        id: o.id,
        userId: o.userId,
        total: o.total,
        status: o.status,
        shippingAddress: JSON.stringify(o.shippingAddress),
        createdAt: o.createdAt,
      });
      for (const it of o.items) {
        insertItem.run(o.id, it.productId, it.quantity, it.priceAtPurchase);
      }
    }
  });

  seed();
}
