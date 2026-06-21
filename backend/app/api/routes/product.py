"""Product domain routes: products, product_modules, product_versions,
releases.

Business rules implemented (SPEC.md section 6.1):
1. Every product must have a unique name -> DB unique constraint + 409 on
   IntegrityError in create_product.
2. Every product can have many modules -> POST/GET /api/v1/products/{id}/modules.
3. Every product must have at least one version -> create_product always
   creates an initial ProductVersion in the same DB transaction (either the
   caller-supplied `initial_version` payload or a "0.1.0 / planned"
   default). There is no endpoint to delete the last remaining version of
   a product (delete_version returns 422 if it is the only version left).
4. Published versions cannot be mutated directly -> update_version rejects
   (422) any update where the version's *current* status is "published".
   Transitioning a non-published version *into* "published" is allowed via
   the same endpoint.
5. Fixes for published versions must create patch/hotfix flows -> out of
   scope for this domain (belongs to Backlog/Planning domains); not
   implemented here (see model file docstring).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.api.schemas.product import (
    ProductCreate,
    ProductModuleCreate,
    ProductModuleOut,
    ProductModuleUpdate,
    ProductOut,
    ProductUpdate,
    ProductVersionCreate,
    ProductVersionOut,
    ProductVersionUpdate,
    ProductWithVersionsOut,
    ReleaseCreate,
    ReleaseOut,
    ReleaseUpdate,
    VALID_PRODUCT_VERSION_STATUSES,
    VALID_RELEASE_STATUSES,
)
from app.db.base import get_db
from app.db.models.product import Product, ProductModule, ProductVersion, Release

router = APIRouter(prefix="/api/v1/products", tags=["products"])


async def _get_product_or_404(db: AsyncSession, product_id: uuid.UUID) -> Product:
    product = await db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


async def _get_version_or_404(db: AsyncSession, version_id: uuid.UUID) -> ProductVersion:
    version = await db.get(ProductVersion, version_id)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product version not found")
    return version


# ---------------------------------------------------------------------------
# Product CRUD (primary entity)
# ---------------------------------------------------------------------------


@router.post("", response_model=ProductWithVersionsOut, status_code=status.HTTP_201_CREATED)
async def create_product(payload: ProductCreate, db: AsyncSession = Depends(get_db)) -> Product:
    product = Product(name=payload.name, description=payload.description)

    initial_version_payload = payload.initial_version or ProductVersionCreate(
        version="0.1.0", status="planned"
    )
    if initial_version_payload.status not in VALID_PRODUCT_VERSION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid version status '{initial_version_payload.status}'",
        )

    # Business rule 6.1.3: a product is never persisted without a version —
    # both rows are added to the same session/transaction.
    version = ProductVersion(
        product=product,
        version=initial_version_payload.version,
        status=initial_version_payload.status,
        release_notes=initial_version_payload.release_notes,
    )

    db.add(product)
    db.add(version)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A product with this name already exists"
        )

    await db.refresh(product, attribute_names=["versions", "modules"])
    return product


@router.get("", response_model=list[ProductOut])
async def list_products(db: AsyncSession = Depends(get_db)) -> list[Product]:
    result = await db.execute(select(Product).order_by(Product.name))
    return list(result.scalars().all())


@router.get("/{product_id}", response_model=ProductWithVersionsOut)
async def get_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Product:
    result = await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.versions), selectinload(Product.modules))
    )
    product = result.scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: uuid.UUID, payload: ProductUpdate, db: AsyncSession = Depends(get_db)
) -> Product:
    product = await _get_product_or_404(db, product_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A product with this name already exists"
        )

    await db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    product = await _get_product_or_404(db, product_id)
    await db.delete(product)
    await db.commit()


# ---------------------------------------------------------------------------
# ProductModule (nested under Product)
# ---------------------------------------------------------------------------


@router.post(
    "/{product_id}/modules", response_model=ProductModuleOut, status_code=status.HTTP_201_CREATED
)
async def create_product_module(
    product_id: uuid.UUID, payload: ProductModuleCreate, db: AsyncSession = Depends(get_db)
) -> ProductModule:
    await _get_product_or_404(db, product_id)

    module = ProductModule(product_id=product_id, name=payload.name, description=payload.description)
    db.add(module)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A module with this name already exists for this product",
        )
    await db.refresh(module)
    return module


@router.get("/{product_id}/modules", response_model=list[ProductModuleOut])
async def list_product_modules(
    product_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[ProductModule]:
    await _get_product_or_404(db, product_id)
    result = await db.execute(
        select(ProductModule).where(ProductModule.product_id == product_id).order_by(ProductModule.name)
    )
    return list(result.scalars().all())


@router.put("/modules/{module_id}", response_model=ProductModuleOut)
async def update_product_module(
    module_id: uuid.UUID, payload: ProductModuleUpdate, db: AsyncSession = Depends(get_db)
) -> ProductModule:
    module = await db.get(ProductModule, module_id)
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product module not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(module, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A module with this name already exists for this product",
        )
    await db.refresh(module)
    return module


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_module(module_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    module = await db.get(ProductModule, module_id)
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product module not found")
    await db.delete(module)
    await db.commit()


# ---------------------------------------------------------------------------
# ProductVersion (nested under Product)
# ---------------------------------------------------------------------------


@router.post(
    "/{product_id}/versions", response_model=ProductVersionOut, status_code=status.HTTP_201_CREATED
)
async def create_product_version(
    product_id: uuid.UUID, payload: ProductVersionCreate, db: AsyncSession = Depends(get_db)
) -> ProductVersion:
    await _get_product_or_404(db, product_id)

    if payload.status not in VALID_PRODUCT_VERSION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid version status '{payload.status}'",
        )

    version = ProductVersion(
        product_id=product_id,
        version=payload.version,
        status=payload.status,
        release_notes=payload.release_notes,
    )
    db.add(version)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This version string already exists for this product",
        )
    await db.refresh(version)
    return version


@router.get("/{product_id}/versions", response_model=list[ProductVersionOut])
async def list_product_versions(
    product_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[ProductVersion]:
    await _get_product_or_404(db, product_id)
    result = await db.execute(
        select(ProductVersion)
        .where(ProductVersion.product_id == product_id)
        .order_by(ProductVersion.created_at)
    )
    return list(result.scalars().all())


@router.get("/versions/{version_id}", response_model=ProductVersionOut)
async def get_product_version(version_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> ProductVersion:
    return await _get_version_or_404(db, version_id)


@router.put("/versions/{version_id}", response_model=ProductVersionOut)
async def update_product_version(
    version_id: uuid.UUID, payload: ProductVersionUpdate, db: AsyncSession = Depends(get_db)
) -> ProductVersion:
    version = await _get_version_or_404(db, version_id)

    # Business rule 6.1.4: published versions cannot be mutated directly.
    if version.status == "published":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Published versions cannot be mutated directly. Create a patch/hotfix flow instead.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in VALID_PRODUCT_VERSION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid version status '{update_data['status']}'",
        )

    for field, value in update_data.items():
        setattr(version, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This version string already exists for this product",
        )
    await db.refresh(version)
    return version


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_version(version_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    version = await _get_version_or_404(db, version_id)

    if version.status == "published":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Published versions cannot be mutated directly.",
        )

    # Business rule 6.1.3: every product must have at least one version.
    result = await db.execute(
        select(ProductVersion.id).where(ProductVersion.product_id == version.product_id)
    )
    remaining_ids = result.scalars().all()
    if len(remaining_ids) <= 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot delete the only remaining version of a product",
        )

    await db.delete(version)
    await db.commit()


# ---------------------------------------------------------------------------
# Release (secondary table, linked to a ProductVersion)
# ---------------------------------------------------------------------------


@router.post("/releases", response_model=ReleaseOut, status_code=status.HTTP_201_CREATED)
async def create_release(payload: ReleaseCreate, db: AsyncSession = Depends(get_db)) -> Release:
    await _get_version_or_404(db, payload.product_version_id)

    if payload.status not in VALID_RELEASE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid release status '{payload.status}'",
        )

    release = Release(
        product_version_id=payload.product_version_id,
        name=payload.name,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(release)
    await db.commit()
    await db.refresh(release)
    return release


@router.get("/releases", response_model=list[ReleaseOut])
async def list_releases(db: AsyncSession = Depends(get_db)) -> list[Release]:
    result = await db.execute(select(Release).order_by(Release.created_at))
    return list(result.scalars().all())


@router.get("/releases/{release_id}", response_model=ReleaseOut)
async def get_release(release_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Release:
    release = await db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")
    return release


@router.put("/releases/{release_id}", response_model=ReleaseOut)
async def update_release(
    release_id: uuid.UUID, payload: ReleaseUpdate, db: AsyncSession = Depends(get_db)
) -> Release:
    release = await db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in VALID_RELEASE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid release status '{update_data['status']}'",
        )

    for field, value in update_data.items():
        setattr(release, field, value)

    await db.commit()
    await db.refresh(release)
    return release


@router.delete("/releases/{release_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_release(release_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    release = await db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")
    await db.delete(release)
    await db.commit()
