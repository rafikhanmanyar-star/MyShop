import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import Fuse from 'fuse.js';
import Modal from '../../../ui/Modal';
import { useInventory } from '../../../../context/InventoryContext';
import type { InventoryItem } from '../../../../types/inventory';
import { shopApi, type ShopBrand, type ShopProductCategory } from '../../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../../services/categoriesOfflineCache';
import { isApiConnectivityFailure, userMessageForApiError } from '../../../../utils/apiConnectivity';
import { ICONS } from '../../../../constants';
import type { AddOrEditSkuModalMode, AddOrEditSkuModalProps, SkuFormStatus, SkuSectionId } from './types';
import { skuFormSchema, type SkuFormSchema } from './schema';
import {
    defaultSkuFormValues,
    deriveCategoryFormFromItem,
    itemToFormValues,
    rowsToAttrs,
    parseWeightForSave,
    MAX_IMAGE_BYTES,
    saveSkuDraft,
    clearSkuDraft,
    loadSkuDraft,
    generateSkuCode
} from './utils';
import { ModalHeader } from './components/ModalHeader';
import { StickyFooter } from './components/StickyFooter';
import { ProductInfoCard } from './components/ProductInfoCard';
import { OrganizationCard } from './components/OrganizationCard';
import { PricingCard } from './components/PricingCard';
import { InventoryCard } from './components/InventoryCard';
import { AttributeBuilder } from './components/AttributeBuilder';
import { MediaUploader } from './components/MediaUploader';
import { SummarySidebar } from './components/SummarySidebar';
import { ChoiceScreen } from './components/ChoiceScreen';
import { SearchScreen } from './components/SearchScreen';
export type { AddOrEditSkuModalMode } from './types';

const AddOrEditSkuModal: React.FC<AddOrEditSkuModalProps> = ({
    isOpen,
    onClose,
    initialSkuOrBarcode = '',
    openInAddMode = false,
    closeOnBackFromAdd = false,
    initialEditingItem = null,
    onItemReady
}) => {
    const { items, addItem, updateItem, deleteItem } = useInventory();
    const [mode, setMode] = useState<AddOrEditSkuModalMode>('choice');
    const [existingSearch, setExistingSearch] = useState('');
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [shopCategories, setShopCategories] = useState<ShopProductCategory[]>([]);
    const [shopBrands, setShopBrands] = useState<ShopBrand[]>([]);
    const [brandCreating, setBrandCreating] = useState(false);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [activeSection, setActiveSection] = useState<SkuSectionId>('basic');
    const [lastAutosave, setLastAutosave] = useState<Date | null>(null);
    const [saveAndNewAfter, setSaveAndNewAfter] = useState(false);
    const [saveContinueAfter, setSaveContinueAfter] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const categoryFormInitForItemId = useRef<string | null>(null);
    const brandFormInitForItemId = useRef<string | null>(null);
    const initialEditingItemRef = useRef<InventoryItem | null>(null);
    initialEditingItemRef.current = initialEditingItem ?? null;

    const form = useForm<SkuFormSchema>({
        resolver: zodResolver(skuFormSchema),
        defaultValues: defaultSkuFormValues,
        mode: 'onChange'
    });

    const { register, handleSubmit, watch, setValue, reset, formState } = form;
    const values = watch();

    const loadCategories = useCallback(async () => {
        try {
            const list = await getShopCategoriesOfflineFirst();
            setShopCategories(Array.isArray(list) ? list : []);
        } catch {
            setShopCategories([]);
        }
    }, []);

    const loadBrands = useCallback(async () => {
        try {
            const list = await shopApi.getShopBrands();
            setShopBrands(Array.isArray(list) ? list : []);
        } catch {
            setShopBrands([]);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        loadCategories();
        loadBrands();

        const editItem = initialEditingItemRef.current;
        if (editItem) {
            brandFormInitForItemId.current = null;
            categoryFormInitForItemId.current = null;
            setMode('edit');
            setExistingSearch('');
            setEditingItem(editItem);
            setSelectedImage(null);
            setImagePreview(editItem.imageUrl || null);
            reset(itemToFormValues(editItem));
            return;
        }

        brandFormInitForItemId.current = null;
        categoryFormInitForItemId.current = null;
        const skuOrBarcode = (initialSkuOrBarcode || '').trim();
        const draft = !openInAddMode ? null : loadSkuDraft();
        const base = { ...defaultSkuFormValues, ...(draft || {}) };
        setMode(openInAddMode ? 'add' : 'choice');
        setExistingSearch('');
        setEditingItem(null);
        reset({
            ...base,
            sku: skuOrBarcode || base.sku,
            barcode: /^\d+$/.test(skuOrBarcode) ? skuOrBarcode : base.barcode
        });
        setSelectedImage(null);
        setImagePreview(null);
    }, [isOpen, initialSkuOrBarcode, openInAddMode, loadCategories, loadBrands, reset]);

    useEffect(() => {
        if (!editingItem) return;
        reset(itemToFormValues(editingItem));
        setImagePreview(editingItem.imageUrl || null);
    }, [editingItem, reset]);

    useEffect(() => {
        if (!editingItem || shopCategories.length === 0) return;
        if (categoryFormInitForItemId.current === editingItem.id) return;
        const derived = deriveCategoryFormFromItem(editingItem, shopCategories);
        setValue('category', derived.category);
        setValue('subcategoryId', derived.subcategoryId);
        categoryFormInitForItemId.current = editingItem.id;
    }, [editingItem, shopCategories, setValue]);

    useEffect(() => {
        if (!editingItem || shopBrands.length === 0) return;
        if (brandFormInitForItemId.current === editingItem.id) return;
        if (editingItem.brandId) {
            const b = shopBrands.find((x) => x.id === editingItem.brandId);
            if (b) {
                setValue('brandId', b.id);
                setValue('brand', b.name);
                brandFormInitForItemId.current = editingItem.id;
                return;
            }
        }
        const name = (editingItem.brand || '').trim();
        if (name) {
            const m = shopBrands.find((x) => x.name.toLowerCase() === name.toLowerCase());
            if (m) {
                setValue('brandId', m.id);
                setValue('brand', m.name);
            }
        }
        brandFormInitForItemId.current = editingItem.id;
    }, [editingItem, shopBrands, setValue]);

    useEffect(() => {
        if (!isOpen || mode === 'choice' || mode === 'search') return;
        if (!formState.isDirty) return;
        const t = window.setTimeout(() => {
            saveSkuDraft(values as SkuFormSchema);
            setLastAutosave(new Date());
        }, 2000);
        return () => clearTimeout(t);
    }, [values, formState.isDirty, isOpen, mode]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                void handleSubmit(onValidSave)();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const fuse = useMemo(
        () => new Fuse(items, { keys: ['sku', 'name', 'barcode'], threshold: 0.4, ignoreLocation: true }),
        [items]
    );

    const existingResults = useMemo(() => {
        const q = existingSearch.trim().toLowerCase();
        if (!q) return items.slice(0, 20);
        return fuse.search(q).map((r) => r.item).slice(0, 20);
    }, [items, existingSearch, fuse]);

    const barcodeConflictItems = useMemo(() => {
        const barcodeNorm = values.barcode.trim().toLowerCase();
        const currentId = editingItem?.id ?? '';
        if (!barcodeNorm) return [];
        return items.filter(
            (i) => i.id !== currentId && i.barcode?.trim().toLowerCase() === barcodeNorm
        );
    }, [items, values.barcode, editingItem?.id]);

    const skuConflictItems = useMemo(() => {
        const skuNorm = values.sku.trim().toLowerCase();
        const currentId = editingItem?.id ?? '';
        if (!skuNorm) return [];
        return items.filter((i) => i.id !== currentId && i.sku?.trim().toLowerCase() === skuNorm);
    }, [items, values.sku, editingItem?.id]);

    const nameConflictItems = useMemo(() => {
        const nameNorm = values.name.trim().toLowerCase();
        const currentId = editingItem?.id ?? '';
        if (!nameNorm) return [];
        return items.filter((i) => i.id !== currentId && i.name.trim().toLowerCase() === nameNorm);
    }, [items, values.name, editingItem?.id]);

    const hasSkuConflict = !editingItem && skuConflictItems.length > 0;

    const weightInvalid = useMemo(() => {
        const t = values.weight.trim();
        if (!t) return false;
        return !Number.isFinite(Number(t));
    }, [values.weight]);

    const hasBlockingConflict = useMemo(() => {
        if (!editingItem) {
            return nameConflictItems.length > 0 || barcodeConflictItems.length > 0;
        }
        const nameChanged =
            values.name.trim().toLowerCase() !== (editingItem.name || '').trim().toLowerCase();
        const barcodeChanged =
            (values.barcode || '').trim().toLowerCase() !==
            (editingItem.barcode || '').trim().toLowerCase();
        return (
            (nameChanged && nameConflictItems.length > 0) ||
            (barcodeChanged && barcodeConflictItems.length > 0)
        );
    }, [editingItem, values.name, values.barcode, nameConflictItems, barcodeConflictItems]);

    const brandExactMatch = useMemo(
        () =>
            shopBrands.find(
                (b) => b.name.toLowerCase().trim() === values.brand.trim().toLowerCase()
            ),
        [values.brand, shopBrands]
    );

    const categoryLabel = useMemo(() => {
        if (values.category === 'General') return 'General';
        const main = shopCategories.find((c) => c.id === values.category);
        const sub = values.subcategoryId
            ? shopCategories.find((c) => c.id === values.subcategoryId)
            : null;
        if (sub) return `${main?.name ?? '—'} › ${sub.name}`;
        return main?.name ?? values.category;
    }, [values.category, values.subcategoryId, shopCategories]);

    const formStatus: SkuFormStatus = values.salesDeactivated
        ? 'archived'
        : !values.name.trim()
          ? 'draft'
          : 'active';

    const handleImageFile = useCallback((file: File) => {
        if (file.size > MAX_IMAGE_BYTES) {
            alert('Image must be 2MB or smaller.');
            return;
        }
        setSelectedImage(file);
        setImagePreview(URL.createObjectURL(file));
    }, []);

    const handleClose = useCallback(() => {
        categoryFormInitForItemId.current = null;
        brandFormInitForItemId.current = null;
        setMode('choice');
        setEditingItem(null);
        reset(defaultSkuFormValues);
        onClose();
    }, [onClose, reset]);

    const handleFormBack = useCallback(() => {
        if (editingItem) {
            setEditingItem(null);
            setMode('search');
        } else if (closeOnBackFromAdd) {
            handleClose();
        } else {
            setMode('choice');
        }
    }, [editingItem, closeOnBackFromAdd, handleClose]);

    const buildInventoryPayload = useCallback(
        (data: SkuFormSchema, imageUrl: string) => {
            const wSave = parseWeightForSave(data.weight);
            const attrSave = rowsToAttrs(data.customAttrRows);
            const mobileDesc = data.mobileDescription.trim() || data.description.trim() || undefined;
            return {
                sku: data.sku || `SKU-${Date.now()}`,
                barcode: data.barcode || undefined,
                name: data.name,
                description: mobileDesc,
                category: data.category,
                subcategoryId: data.subcategoryId || undefined,
                retailPrice: Number(data.retailPrice),
                costPrice: Number(data.costPrice),
                taxRate: Number(data.taxRate),
                reorderPoint: Number(data.reorderPoint),
                unit: data.unit,
                imageUrl,
                salesDeactivated: data.salesDeactivated,
                brand: data.brand.trim() || undefined,
                brandId: data.brandId || undefined,
                weight: wSave,
                weightUnit: wSave != null ? data.weightUnit.trim() || null : null,
                size: data.size.trim() || undefined,
                color: data.color.trim() || undefined,
                material: data.material.trim() || undefined,
                originCountry: data.originCountry.trim() || undefined,
                attributes: attrSave ?? undefined
            };
        },
        []
    );

    const persistForm = useCallback(
        async (data: SkuFormSchema) => {
            if (hasBlockingConflict || hasSkuConflict || weightInvalid) return;

            setSaving(true);
            try {
                let imageUrl = data.imageUrl;
                let imageAlreadyUploaded = false;
                if (selectedImage && typeof navigator !== 'undefined' && navigator.onLine) {
                    const uploadRes = await shopApi.uploadImage(selectedImage);
                    imageUrl = uploadRes.imageUrl || '';
                    imageAlreadyUploaded = true;
                }

                const payload = buildInventoryPayload(data, imageUrl);

                if (editingItem) {
                    await updateItem(editingItem.id, payload);
                    clearSkuDraft();
                    const updated: InventoryItem = {
                        ...editingItem,
                        ...payload,
                        onHand: editingItem.onHand,
                        available: editingItem.available,
                        reserved: editingItem.reserved,
                        inTransit: editingItem.inTransit,
                        damaged: editingItem.damaged,
                        warehouseStock: editingItem.warehouseStock
                    };
                    if (saveContinueAfter) {
                        setSaveContinueAfter(false);
                        setSaving(false);
                        onItemReady?.(updated, 'updated');
                        return;
                    }
                    handleClose();
                    onItemReady?.(updated, 'updated');
                } else {
                    const newItem = await addItem(
                        {
                            id: '',
                            ...payload,
                            onHand: 0,
                            available: 0,
                            reserved: 0,
                            inTransit: 0,
                            damaged: 0,
                            warehouseStock: {}
                        },
                        imageAlreadyUploaded ? undefined : selectedImage || undefined
                    );
                    clearSkuDraft();
                    if (saveAndNewAfter) {
                        setSaveAndNewAfter(false);
                        reset(defaultSkuFormValues);
                        setSelectedImage(null);
                        setImagePreview(null);
                        setSaving(false);
                        onItemReady?.(newItem, 'created');
                        return;
                    }
                    handleClose();
                    onItemReady?.(newItem, 'created');
                }
            } catch (e) {
                console.error(e);
                if (isApiConnectivityFailure(e)) {
                    alert(userMessageForApiError(e, 'Could not save SKU.'));
                }
            } finally {
                setSaving(false);
            }
        },
        [
            hasBlockingConflict,
            hasSkuConflict,
            weightInvalid,
            selectedImage,
            buildInventoryPayload,
            editingItem,
            updateItem,
            addItem,
            handleClose,
            onItemReady,
            saveAndNewAfter,
            saveContinueAfter,
            reset
        ]
    );

    const onValidSave = useCallback(
        (data: SkuFormSchema) => persistForm(data),
        [persistForm]
    );

    const handleDeleteSku = useCallback(async () => {
        if (!editingItem || editingItem.id.startsWith('pending-')) return;
        if (
            !window.confirm(
                `Archive "${editingItem.name}" (SKU: ${editingItem.sku})? This removes it from the catalog.`
            )
        ) {
            return;
        }
        setDeleting(true);
        try {
            await deleteItem(editingItem.id);
            handleClose();
        } catch (e: unknown) {
            const err = e as { message?: string; error?: string };
            const msg = isApiConnectivityFailure(e)
                ? userMessageForApiError(e, 'Could not delete SKU.')
                : (err?.message ?? err?.error ?? 'Could not archive SKU.');
            alert(msg);
        } finally {
            setDeleting(false);
        }
    }, [editingItem, deleteItem, handleClose]);

    const handleDuplicate = useCallback(() => {
        if (!editingItem) return;
        const dup = itemToFormValues(editingItem);
        dup.sku = generateSkuCode(dup.name);
        dup.barcode = '';
        setEditingItem(null);
        setMode('add');
        reset(dup);
        setSelectedImage(null);
        setImagePreview(editingItem.imageUrl || null);
    }, [editingItem, reset]);

    const scrollToSection = (id: SkuSectionId) => {
        setActiveSection(id);
        document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const onBrandFieldChange = (value: string) => {
        setValue('brand', value, { shouldDirty: true });
        if (values.brandId) {
            const sel = shopBrands.find((x) => x.id === values.brandId);
            if (!sel || sel.name !== value) setValue('brandId', '', { shouldDirty: true });
        }
    };

    const createBrandFromQuery = async () => {
        const name = values.brand.trim();
        if (!name || brandExactMatch) return;
        setBrandCreating(true);
        try {
            const res = await shopApi.createShopBrand({ name });
            if (!res.id) return;
            setShopBrands((prev) =>
                [...prev.filter((x) => x.id !== res.id), { id: res.id, name }].sort((a, b) =>
                    a.name.localeCompare(b.name)
                )
            );
            setValue('brandId', res.id, { shouldDirty: true });
            setValue('brand', name, { shouldDirty: true });
        } catch (e: unknown) {
            const err = e as { message?: string };
            alert(err?.message || 'Could not create brand');
        } finally {
            setBrandCreating(false);
        }
    };

    const showSkuForm = mode === 'add' || !!editingItem;
    const canSave = Boolean(values.name.trim()) && !hasBlockingConflict && !hasSkuConflict && !weightInvalid;

    const title =
        mode === 'choice'
            ? 'Add or Edit SKU'
            : mode === 'search'
              ? 'Search Existing SKU'
              : mode === 'add'
                ? 'Add New SKU'
                : 'Edit SKU';

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={title}
            size="full"
            hideHeader={showSkuForm}
            hideClose={showSkuForm}
            disableScroll={showSkuForm}
            className={
                showSkuForm
                    ? 'flex h-[90vh] max-h-[90vh] w-[85vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl p-0 sm:mx-0'
                    : 'max-w-2xl'
            }
        >
            <AnimatePresence mode="wait">
                {mode === 'choice' && (
                    <ChoiceScreen
                        onSearch={() => setMode('search')}
                        onAddNew={() => setMode('add')}
                        onClose={handleClose}
                    />
                )}

                {mode === 'search' && !editingItem && (
                    <SearchScreen
                        search={existingSearch}
                        onSearchChange={setExistingSearch}
                        results={existingResults}
                        onSelect={setEditingItem}
                        onBack={() => setMode('choice')}
                        onAddNew={() => {
                            setEditingItem(null);
                            setMode('add');
                        }}
                    />
                )}

                {showSkuForm && (
                    <motion.div
                        key="sku-form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex min-h-0 flex-1 flex-col overflow-hidden"
                    >
                        <ModalHeader
                            title={values.name.trim() || 'Untitled product'}
                            sku={values.sku}
                            status={formStatus}
                            imagePreview={imagePreview}
                            activeSection={activeSection}
                            onSectionClick={scrollToSection}
                            onBack={handleFormBack}
                            onClose={handleClose}
                            onDuplicate={editingItem ? handleDuplicate : undefined}
                            onArchive={
                                editingItem && !editingItem.id.startsWith('pending-')
                                    ? handleDeleteSku
                                    : undefined
                            }
                            backLabel={closeOnBackFromAdd ? 'Back to Inventory' : 'Back'}
                            isEditing={!!editingItem}
                        />

                        <div
                            ref={scrollRef}
                            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60 px-4 py-5 sm:px-6"
                            onScroll={() => {
                                for (const s of [
                                    'basic',
                                    'organization',
                                    'pricing',
                                    'inventory',
                                    'attributes',
                                    'media'
                                ] as SkuSectionId[]) {
                                    const el = document.getElementById(`section-${s}`);
                                    if (el) {
                                        const rect = el.getBoundingClientRect();
                                        if (rect.top >= 80 && rect.top < 280) {
                                            setActiveSection(s);
                                            break;
                                        }
                                    }
                                }
                            }}
                        >
                            {hasBlockingConflict && (
                                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                                    <div className="flex items-center gap-2 font-semibold">
                                        {React.cloneElement(ICONS.alertTriangle as React.ReactElement, {
                                            size: 16
                                        })}
                                        Resolve conflicts before saving
                                    </div>
                                    <p className="mt-1 text-xs">
                                        Name or barcode must be unique across your catalog.
                                    </p>
                                </div>
                            )}

                            <div className="grid gap-6 lg:grid-cols-[1fr_340px] xl:grid-cols-[3fr_2fr]">
                                <div className="space-y-5 min-w-0">
                                    <ProductInfoCard
                                        register={register}
                                        errors={formState.errors}
                                        watch={watch}
                                        setValue={setValue}
                                        isEditing={!!editingItem}
                                        imagePreview={imagePreview}
                                        onImageSelect={handleImageFile}
                                        onImageClear={() => {
                                            setSelectedImage(null);
                                            setImagePreview(null);
                                            setValue('imageUrl', '', { shouldDirty: true });
                                        }}
                                        skuConflict={hasSkuConflict}
                                        barcodeConflict={barcodeConflictItems.length > 0}
                                        nameConflict={nameConflictItems.length > 0}
                                    />
                                    <OrganizationCard
                                        watch={watch}
                                        setValue={setValue}
                                        shopCategories={shopCategories}
                                        shopBrands={shopBrands}
                                        brandCreating={brandCreating}
                                        onBrandChange={onBrandFieldChange}
                                        onSelectBrand={(b) => {
                                            setValue('brand', b.name, { shouldDirty: true });
                                            setValue('brandId', b.id, { shouldDirty: true });
                                        }}
                                        onCreateBrand={createBrandFromQuery}
                                        brandExactMatch={brandExactMatch}
                                    />
                                    <PricingCard watch={watch} setValue={setValue} />
                                    <AttributeBuilder watch={watch} setValue={setValue} />
                                    <MediaUploader
                                        imagePreview={imagePreview}
                                        onImageSelect={handleImageFile}
                                    />
                                </div>

                                <div className="space-y-5 min-w-0">
                                    <InventoryCard
                                        watch={watch}
                                        setValue={setValue}
                                        editingItem={editingItem}
                                    />
                                    <SummarySidebar
                                        watch={watch}
                                        imagePreview={imagePreview}
                                        editingItem={editingItem}
                                        categoryLabel={categoryLabel}
                                        onSaveDraft={() => {
                                            saveSkuDraft(values as SkuFormSchema);
                                            setLastAutosave(new Date());
                                        }}
                                        onSaveAndNew={
                                            !editingItem
                                                ? () => {
                                                      setSaveAndNewAfter(true);
                                                      void handleSubmit(onValidSave)();
                                                  }
                                                : undefined
                                        }
                                        onSaveContinue={
                                            editingItem
                                                ? () => {
                                                      setSaveContinueAfter(true);
                                                      void handleSubmit(onValidSave)();
                                                  }
                                                : undefined
                                        }
                                        onArchive={
                                            editingItem && !editingItem.id.startsWith('pending-')
                                                ? handleDeleteSku
                                                : undefined
                                        }
                                        isEditing={!!editingItem}
                                    />
                                </div>
                            </div>
                        </div>

                        <StickyFooter
                            isDirty={formState.isDirty}
                            lastAutosave={lastAutosave}
                            saving={saving}
                            deleting={deleting}
                            canSave={canSave}
                            isEditing={!!editingItem}
                            onCancel={handleClose}
                            onSaveDraft={() => {
                                saveSkuDraft(values as SkuFormSchema);
                                setLastAutosave(new Date());
                            }}
                            onSave={() => void handleSubmit(onValidSave)()}
                            onArchive={
                                editingItem && !editingItem.id.startsWith('pending-')
                                    ? handleDeleteSku
                                    : undefined
                            }
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </Modal>
    );
};

export default AddOrEditSkuModal;
