import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Loader2, PackageSearch, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useProducts,
  useCreateProduct,
  useDeleteProduct,
  productInputSchema,
  type ProductInput,
} from "@/hooks/useProduct";

const statusBadgeVariant: Record<string, "success" | "secondary" | "outline"> = {
  active: "success",
  inactive: "secondary",
  archived: "outline",
};

export default function ProductPage() {
  const { data: products, isLoading, isError, error, refetch } = useProducts();
  const createProduct = useCreateProduct();
  const deleteProduct = useDeleteProduct();
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productInputSchema),
    defaultValues: { name: "", description: "", status: "active" },
  });

  const onSubmit = async (values: ProductInput) => {
    await createProduct.mutateAsync(values);
    reset();
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            Products under continuous development, each with one or more versions.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          New Product
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Create Product</CardTitle>
              <CardDescription>Register a new product. Name must be unique.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="e.g. ForgeHub" {...register("name")} />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description of the product"
                  {...register("description")}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select id="status" {...register("status")}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              {createProduct.isError && (
                <p className="text-sm text-destructive">
                  Failed to create product. Please try again.
                </p>
              )}
            </CardContent>
            <CardFooter className="gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  setShowForm(false);
                }}
              >
                Cancel
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading products...
            </div>
          )}

          {isError && !isLoading && (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Failed to load products."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !isError && (products?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              <PackageSearch className="h-10 w-10" />
              <p className="font-medium">No products yet</p>
              <p className="text-sm">Create your first product to get started.</p>
            </div>
          )}

          {!isLoading && !isError && (products?.length ?? 0) > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Versions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products?.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        to={`/product/${product.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {product.name}
                      </Link>
                      {product.description && (
                        <p className="line-clamp-1 text-sm text-muted-foreground">
                          {product.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusBadgeVariant[product.status] ?? "outline"}
                        className={cn("capitalize")}
                      >
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{product.versions?.length ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${product.name}`}
                        disabled={deleteProduct.isPending}
                        onClick={() => deleteProduct.mutate(product.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
