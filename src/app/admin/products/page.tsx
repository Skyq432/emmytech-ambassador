'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  X,
  Save,
  Loader2,
  Tags,
  Upload,
  ImageIcon,
  Star,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface ProductImage {
  id?: string;
  product_id?: string;
  image_url: string;
  image_path?: string | null;
  is_primary: boolean;
  sort_order: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  original_price: number | null;
  discount_percentage: number | null;
  sale_price: number | null;
  product_tag: string | null;
  image_url: string | null;
  category_id: string | null;
  category: string | null;
  stock: number | null;
  status: string;
  featured?: boolean | null;
  admin_notes?: string | null;
  publish_block_reason?: string | null;
  product_categories?: Category | null;
}

const tagOptions = [
  '',
  'Best Seller',
  'Hot Deal',
  'Cheapest In Market',
  'New Arrival',
  'Top Rated',
  'Limited Stock',
  'Staff Pick',
  'Featured Product',
  'Promo Item',
];

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  price: '',
  original_price: '',
  discount_percentage: '',
  sale_price: '',
  product_tag: '',
  image_url: '',
  category_id: '',
  stock: '',
  status: 'draft',
  featured: false,
  admin_notes: '',
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function formatCurrency(value: number | null | undefined) {
  if (!value || value <= 0) return 'Quote';

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value);
}

function getPublishMissing(form: typeof emptyForm, galleryImages: ProductImage[]) {
  const missing: string[] = [];

  if (!form.name.trim()) missing.push('Product name');
  if (!form.slug.trim()) missing.push('Slug');
  if (!form.category_id) missing.push('Category');
  if (!form.description.trim()) missing.push('Description');
  if (!form.stock.trim()) missing.push('Stock');
  if (!form.image_url.trim() && galleryImages.length === 0) missing.push('Product image');

  const hasPrice = Number(form.price || 0) > 0 || Number(form.sale_price || 0) > 0;
  if (!hasPrice) missing.push('Price or sale price');

  return missing;
}

export default function AdminProductsPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [galleryImages, setGalleryImages] = useState<ProductImage[]>([]);

  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);

    const [{ data: productData, error: productError }, { data: categoryData }] =
      await Promise.all([
        supabase
          .from('products')
          .select('*, product_categories(id, name, slug)')
          .order('created_at', { ascending: false }),
        supabase.from('product_categories').select('*').order('name', { ascending: true }),
      ]);

    if (productError) {
      alert(productError.message);
      setProducts([]);
    } else {
      setProducts(productData || []);
    }

    setCategories(categoryData || []);
    setLoading(false);
  }

  async function fetchProductImages(productId: string) {
    const { data, error } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });

    if (error) {
      alert(error.message);
      setGalleryImages([]);
      return;
    }

    setGalleryImages(data || []);
  }

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();

    return products.filter((product) => {
      return (
        product.name?.toLowerCase().includes(q) ||
        product.slug?.toLowerCase().includes(q) ||
        product.product_tag?.toLowerCase().includes(q) ||
        product.product_categories?.name?.toLowerCase().includes(q)
      );
    });
  }, [products, search]);

  function openCreateModal() {
    setEditingProduct(null);
    setForm(emptyForm);
    setGalleryImages([]);
    setModalOpen(true);
  }

  async function openEditModal(product: Product) {
    setEditingProduct(product);

    setForm({
      name: product.name || '',
      slug: product.slug || '',
      description: product.description || '',
      price: product.price ? String(product.price) : '',
      original_price: product.original_price ? String(product.original_price) : '',
      discount_percentage: product.discount_percentage ? String(product.discount_percentage) : '',
      sale_price: product.sale_price ? String(product.sale_price) : '',
      product_tag: product.product_tag || '',
      image_url: product.image_url || '',
      category_id: product.category_id || '',
      stock: product.stock ? String(product.stock) : '',
      status: product.status || 'draft',
      featured: Boolean(product.featured),
      admin_notes: product.admin_notes || '',
    });

    await fetchProductImages(product.id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setGalleryImages([]);
  }

  function updateName(value: string) {
    setForm((prev) => ({
      ...prev,
      name: value,
      slug: prev.slug || slugify(value),
    }));
  }

  function updatePriceField(key: 'original_price' | 'discount_percentage' | 'sale_price', value: string) {
    const next = { ...form, [key]: value };

    const originalPrice = Number(key === 'original_price' ? value : next.original_price || 0);
    const discount = Number(key === 'discount_percentage' ? value : next.discount_percentage || 0);

    if (originalPrice > 0 && discount > 0) {
      const salePrice = originalPrice - (originalPrice * discount) / 100;
      next.sale_price = String(Math.round(salePrice));
      next.price = String(Math.round(salePrice));
    }

    if (key === 'sale_price') {
      next.price = value;
    }

    setForm(next);
  }

  async function uploadProductImage(file: File) {
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const safeName = file.name
        .replace(`.${fileExt}`, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}.${fileExt}`;
      const path = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('product-images').getPublicUrl(path);

      return {
        image_url: data.publicUrl,
        image_path: path,
      };
    } catch (error: any) {
      alert(error.message || 'Image upload failed.');
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleImageUpload(files: FileList | null) {
    if (!files?.length) return;

    const uploaded: ProductImage[] = [];

    for (const file of Array.from(files)) {
      const image = await uploadProductImage(file);

      if (image) {
        uploaded.push({
          image_url: image.image_url,
          image_path: image.image_path,
          is_primary: false,
          sort_order: galleryImages.length + uploaded.length,
        });
      }
    }

    if (!uploaded.length) return;

    const nextGallery = [...galleryImages, ...uploaded];
    const currentPrimary = form.image_url || nextGallery[0]?.image_url || '';

    setGalleryImages(nextGallery);
    setForm((prev) => ({ ...prev, image_url: currentPrimary }));
  }

  async function saveGalleryImages(productId: string, primaryImageUrl: string) {
    if (!galleryImages.length) return;

    const newImages = galleryImages.filter((image) => !image.id);

    if (newImages.length > 0) {
      const rows = newImages.map((image, index) => ({
        product_id: productId,
        image_url: image.image_url,
        image_path: image.image_path || null,
        is_primary: image.image_url === primaryImageUrl,
        sort_order: image.sort_order ?? index,
      }));

      const { error } = await supabase.from('product_images').insert(rows);
      if (error) throw error;
    }

    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId);

    await supabase
      .from('product_images')
      .update({ is_primary: true })
      .eq('product_id', productId)
      .eq('image_url', primaryImageUrl);
  }

  async function saveProduct() {
    const primaryImage = form.image_url || galleryImages[0]?.image_url || '';
    const missing = getPublishMissing({ ...form, image_url: primaryImage }, galleryImages);

    if (form.status === 'active' && missing.length > 0) {
      alert(`Product cannot be activated.\n\nMissing:\n- ${missing.join('\n- ')}`);
      return;
    }

    setSaving(true);

    try {
      const selectedCategory = categories.find((c) => c.id === form.category_id);

      const payload = {
        name: form.name.trim(),
        slug: slugify(form.slug || form.name),
        description: form.description.trim() || null,
        price: Number(form.price || form.sale_price || 0),
        original_price: Number(form.original_price || 0),
        discount_percentage: Number(form.discount_percentage || 0),
        sale_price: Number(form.sale_price || form.price || 0),
        product_tag: form.product_tag || null,
        image_url: primaryImage || null,
        category_id: form.category_id || null,
        category: selectedCategory?.slug || null,
        stock: Number(form.stock || 0),
        status: form.status,
        featured: form.featured,
        admin_notes: form.admin_notes.trim() || null,
        publish_block_reason: missing.length > 0 ? `Missing: ${missing.join(', ')}` : null,
        updated_at: new Date().toISOString(),
      };

      let productId = editingProduct?.id;
      let error;

      if (editingProduct) {
        const result = await supabase.from('products').update(payload).eq('id', editingProduct.id);
        error = result.error;
      } else {
        const result = await supabase.from('products').insert(payload).select('id').single();
        error = result.error;
        productId = result.data?.id;
      }

      if (error) throw error;
      if (!productId) throw new Error('Product saved, but product ID was not returned.');

      await saveGalleryImages(productId, primaryImage);
      await fetchAll();
      closeModal();
    } catch (error: any) {
      alert(error.message || 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(product: Product) {
    if (product.status !== 'active') {
      const images = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', product.id);

      const tempForm = {
        ...emptyForm,
        name: product.name || '',
        slug: product.slug || '',
        description: product.description || '',
        price: product.price ? String(product.price) : '',
        sale_price: product.sale_price ? String(product.sale_price) : '',
        image_url: product.image_url || '',
        category_id: product.category_id || '',
        stock: product.stock ? String(product.stock) : '',
      };

      const missing = getPublishMissing(tempForm, images.data || []);

      if (missing.length > 0) {
        alert(`This product cannot be activated.\n\nMissing:\n- ${missing.join('\n- ')}`);
        return;
      }
    }

    const newStatus = product.status === 'active' ? 'draft' : 'active';

    const { error } = await supabase
      .from('products')
      .update({
        status: newStatus,
        publish_block_reason: newStatus === 'active' ? null : product.publish_block_reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', product.id);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchAll();
  }

  async function deleteProduct(product: Product) {
    if (!confirm(`Delete ${product.name}?`)) return;

    const { error } = await supabase.from('products').delete().eq('id', product.id);

    if (error) alert(error.message);
    else await fetchAll();
  }

  async function addCategory() {
    if (!newCategory.trim()) return;

    const { error } = await supabase.from('product_categories').insert({
      name: newCategory.trim(),
      slug: slugify(newCategory),
    });

    if (error) alert(error.message);
    else {
      setNewCategory('');
      await fetchAll();
    }
  }

  async function deleteCategory(category: Category) {
    if (!confirm(`Delete category "${category.name}"?`)) return;

    const { error } = await supabase.from('product_categories').delete().eq('id', category.id);

    if (error) alert(error.message);
    else await fetchAll();
  }

  async function removeGalleryImage(image: ProductImage) {
    const isPrimary = form.image_url === image.image_url;
    const nextImages = galleryImages.filter((item) => item.image_url !== image.image_url);
    const nextPrimary = isPrimary ? nextImages[0]?.image_url || '' : form.image_url;

    if (image.id) {
      const { error } = await supabase.from('product_images').delete().eq('id', image.id);
      if (error) {
        alert(error.message);
        return;
      }
    }

    if (image.image_path) {
      await supabase.storage.from('product-images').remove([image.image_path]);
    }

    setGalleryImages(nextImages);
    setForm((prev) => ({ ...prev, image_url: nextPrimary }));
  }

  function setPrimaryImage(image: ProductImage) {
    setForm((prev) => ({ ...prev, image_url: image.image_url }));
    setGalleryImages((prev) =>
      prev.map((item) => ({ ...item, is_primary: item.image_url === image.image_url }))
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emmy-primary" />
      </div>
    );
  }

  const missing = getPublishMissing(form, galleryImages);
  const activeProducts = products.filter((p) => p.status === 'active').length;
  const draftProducts = products.filter((p) => p.status !== 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            Manage products, categories, discounts, tags, stock and product images.
          </p>
        </div>

        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Products</p>
            <p className="mt-2 text-3xl font-bold">{products.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{activeProducts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Draft/Hidden</p>
            <p className="mt-2 text-3xl font-bold text-slate-500">{draftProducts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Categories</p>
            <p className="mt-2 text-3xl font-bold">{categories.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Tags className="h-5 w-5 text-emmy-primary" />
            <h2 className="font-semibold">Product Categories</h2>
          </div>

          <div className="mb-4 flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Add category e.g. Laptops"
            />
            <Button onClick={addCategory}>Add</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat.id}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
              >
                {cat.name}
                <button onClick={() => deleteCategory(cat)} className="text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <h3 className="text-lg font-semibold">No products found</h3>
            <p className="text-sm text-muted-foreground">Add a new product or change your search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="overflow-hidden">
              <div className="h-44 bg-slate-100">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-12 w-12 text-slate-300" />
                  </div>
                )}
              </div>

              <CardContent className="p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold leading-tight">{product.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {product.product_categories?.name || 'No category'} · /{product.slug}
                    </p>
                  </div>

                  <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                    {product.status}
                  </Badge>
                </div>

                {product.product_tag && (
                  <Badge variant="secondary" className="mb-3">
                    {product.product_tag}
                  </Badge>
                )}

                <p className="line-clamp-2 min-h-[40px] text-sm text-muted-foreground">
                  {product.description || 'No description provided.'}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xs text-muted-foreground">Sale Price</p>
                    <p className="font-bold">{formatCurrency(product.sale_price || product.price)}</p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xs text-muted-foreground">Old Price</p>
                    <p className="font-bold">{formatCurrency(product.original_price)}</p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xs text-muted-foreground">Discount</p>
                    <p className="font-bold">{product.discount_percentage || 0}%</p>
                  </div>
                </div>

                {product.publish_block_reason && product.status !== 'active' && (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                    {product.publish_block_reason}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditModal(product)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>

                  <Button variant="secondary" size="sm" onClick={() => toggleStatus(product)}>
                    {product.status === 'active' ? (
                      <>
                        <EyeOff className="mr-1 h-3.5 w-3.5" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Activate
                      </>
                    )}
                  </Button>

                  <Button variant="danger" size="sm" onClick={() => deleteProduct(product)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <div>
                <h2 className="text-xl font-bold">{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
                <p className="text-sm text-muted-foreground">Upload images and complete all required fields before activating.</p>
              </div>

              <button onClick={closeModal} className="rounded-full p-2 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 p-6">
              {form.status === 'active' && missing.length > 0 && (
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  <strong>Cannot activate product yet.</strong>
                  <ul className="mt-2 list-disc pl-5">
                    {missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Product Name</label>
                  <Input value={form.name} onChange={(e) => updateName(e.target.value)} placeholder="Product name" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Slug</label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                    placeholder="product-slug"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Original Price</label>
                  <Input
                    type="number"
                    value={form.original_price}
                    onChange={(e) => updatePriceField('original_price', e.target.value)}
                    placeholder="Original price"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Discount %</label>
                  <Input
                    type="number"
                    value={form.discount_percentage}
                    onChange={(e) => updatePriceField('discount_percentage', e.target.value)}
                    placeholder="Discount %"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Sale Price</label>
                  <Input
                    type="number"
                    value={form.sale_price}
                    onChange={(e) => updatePriceField('sale_price', e.target.value)}
                    placeholder="Sale price"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Product Tag</label>
                  <select
                    value={form.product_tag}
                    onChange={(e) => setForm({ ...form, product_tag: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    {tagOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag || 'No tag'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Stock</label>
                  <Input
                    type="number"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    placeholder="Stock"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                    />
                    Featured product
                  </label>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="text-sm font-medium">Product Images</label>
                    <p className="text-xs text-muted-foreground">Upload one or multiple images. Select the star to make an image primary.</p>
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emmy-primary px-4 py-2 text-sm font-medium text-white">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? 'Uploading...' : 'Upload Images'}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e.target.files)}
                    />
                  </label>
                </div>

                {galleryImages.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                    <div className="text-center">
                      <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                      <p className="text-sm">No product image uploaded yet.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {galleryImages.map((image, index) => {
                      const primary = form.image_url === image.image_url;

                      return (
                        <div key={`${image.image_url}-${index}`} className="relative overflow-hidden rounded-xl border bg-slate-50">
                          <img src={image.image_url} alt="Product" className="h-32 w-full object-cover" />

                          <div className="absolute left-2 top-2 flex gap-1">
                            <button
                              type="button"
                              onClick={() => setPrimaryImage(image)}
                              className={`rounded-full p-1 shadow ${primary ? 'bg-yellow-400 text-white' : 'bg-white text-slate-500'}`}
                              title="Set as primary"
                            >
                              <Star className="h-4 w-4" fill={primary ? 'currentColor' : 'none'} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeGalleryImage(image)}
                            className="absolute right-2 top-2 rounded-full bg-white p-1 text-red-500 shadow"
                            title="Delete image"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>

                          {primary && (
                            <div className="absolute bottom-0 left-0 right-0 bg-yellow-400 px-2 py-1 text-center text-xs font-bold text-slate-900">
                              Primary
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Product description"
                rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />

              <textarea
                value={form.admin_notes}
                onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
                placeholder="Admin notes"
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>

                <Button onClick={saveProduct} disabled={saving || uploading} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Product'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
