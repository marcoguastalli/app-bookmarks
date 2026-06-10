import { test, expect } from "@playwright/test";

test.describe("Bookmarks App", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows empty state on first load", async ({ page }) => {
    await expect(page.getByText("Select a folder to view bookmarks")).toBeVisible();
  });

  test("can create a folder", async ({ page }) => {
    // Click the + button in the sidebar header
    await page.getByTitle("New folder").click();
    await expect(page.getByText("New Folder")).toBeVisible();

    await page.getByPlaceholder("Folder name").fill("My Test Folder");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("My Test Folder")).toBeVisible();
  });

  test("can select a folder and see empty bookmark state", async ({ page }) => {
    // Create folder
    await page.getByTitle("New folder").click();
    await page.getByPlaceholder("Folder name").fill("Work");
    await page.getByRole("button", { name: "Create" }).click();

    // Click on the folder
    await page.getByText("Work").click();
    await expect(page.getByText("No bookmarks yet.")).toBeVisible();
  });

  test("can add a bookmark to a folder", async ({ page }) => {
    // Create folder
    await page.getByTitle("New folder").click();
    await page.getByPlaceholder("Folder name").fill("Work");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByText("Work").click();

    // Add bookmark
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByPlaceholder("Bookmark title").fill("GitHub");
    await page.getByPlaceholder("https://example.com").fill("https://github.com");
    await page.getByRole("button", { name: "Add" }).last().click();

    await expect(page.getByText("GitHub")).toBeVisible();
    await expect(page.getByText("https://github.com")).toBeVisible();
  });

  test("can edit a bookmark", async ({ page }) => {
    // Setup
    await page.getByTitle("New folder").click();
    await page.getByPlaceholder("Folder name").fill("Test");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByText("Test").click();

    await page.getByRole("button", { name: "Add" }).click();
    await page.getByPlaceholder("Bookmark title").fill("Old Title");
    await page.getByPlaceholder("https://example.com").fill("https://example.com");
    await page.getByRole("button", { name: "Add" }).last().click();

    // Edit
    await page.getByText("Old Title").hover();
    await page.getByTitle("Edit").first().click();
    await page.getByPlaceholder("Bookmark title").clear();
    await page.getByPlaceholder("Bookmark title").fill("New Title");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("New Title")).toBeVisible();
  });

  test("can delete a bookmark", async ({ page }) => {
    // Setup
    await page.getByTitle("New folder").click();
    await page.getByPlaceholder("Folder name").fill("Test");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByText("Test").click();

    await page.getByRole("button", { name: "Add" }).click();
    await page.getByPlaceholder("Bookmark title").fill("To Delete");
    await page.getByPlaceholder("https://example.com").fill("https://todelete.com");
    await page.getByRole("button", { name: "Add" }).last().click();

    // Delete
    await page.getByText("To Delete").hover();
    await page.getByTitle("Delete").first().click();
    await page.getByRole("button", { name: "Delete" }).last().click();

    await expect(page.getByText("To Delete")).not.toBeVisible();
  });

  test("can open export panel", async ({ page }) => {
    await page.getByText("Export bookmarks").click();
    await expect(page.getByText("Export Bookmarks")).toBeVisible();
    await expect(page.getByText("Download bookmarks.html")).toBeVisible();
  });

  test("can open import panel", async ({ page }) => {
    await page.getByText("Import bookmarks").click();
    await expect(page.getByText("Import Bookmarks")).toBeVisible();
    await expect(page.getByText("Target folder")).toBeVisible();
  });

  test("can search bookmarks", async ({ page }) => {
    // Setup
    await page.getByTitle("New folder").click();
    await page.getByPlaceholder("Folder name").fill("Search Test");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByText("Search Test").click();

    await page.getByRole("button", { name: "Add" }).click();
    await page.getByPlaceholder("Bookmark title").fill("GitHub");
    await page.getByPlaceholder("https://example.com").fill("https://github.com");
    await page.getByRole("button", { name: "Add" }).last().click();

    await page.getByRole("button", { name: "Add" }).click();
    await page.getByPlaceholder("Bookmark title").fill("Google");
    await page.getByPlaceholder("https://example.com").fill("https://google.com");
    await page.getByRole("button", { name: "Add" }).last().click();

    // Search
    await page.getByPlaceholder("Search...").fill("GitHub");
    await expect(page.getByText("GitHub")).toBeVisible();
    await expect(page.getByText("Google")).not.toBeVisible();
  });

  test("can rename a folder", async ({ page }) => {
    await page.getByTitle("New folder").click();
    await page.getByPlaceholder("Folder name").fill("Old Folder");
    await page.getByRole("button", { name: "Create" }).click();

    await page.getByText("Old Folder").hover();
    await page.getByTitle("Rename").first().click();
    await page.getByPlaceholder("Folder name").clear();
    await page.getByPlaceholder("Folder name").fill("New Folder");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("New Folder")).toBeVisible();
  });

  test("closes modal on Escape key", async ({ page }) => {
    await page.getByTitle("New folder").click();
    await expect(page.getByText("New Folder")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("New Folder")).not.toBeVisible();
  });
});
