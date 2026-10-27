import { db } from "@/db";
import { articleCategories } from "@/db/schema";
import { requireStaff } from "@/server/auth/session";
import { PageTitle } from "@/components/admin/ui";
import { ArticleEditor } from "@/components/admin/ArticleEditor";
import { pickLocalized } from "@/i18n/dictionaries";

export default async function NewArticle() {
  await requireStaff("content:edit");
  const cats = await db().select().from(articleCategories);
  return (
    <div>
      <PageTitle title="New article" />
      <ArticleEditor categories={cats.map((c) => ({ id: c.id, name: pickLocalized(c.name, "en") }))} initial={null} />
    </div>
  );
}
