from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import json
import time

BASE_URL = "https://www.interactsoftware.com"  # Replace with your website
START_URLS = [BASE_URL]  # Add initial pages to scrape
SCRAPED_PAGES = set()  # To avoid duplicate scraping

def get_page_content(url, browser):
    """Fetch page content using Playwright and extract text using BeautifulSoup."""
    context = browser.new_context()
    page = context.new_page()
    page.goto(url, timeout=60000)  # Wait for full page load
    time.sleep(2)  # Allow dynamic content to load
    html = page.content()
    context.close()
    return html

def extract_text(html):
    """Extract visible text from HTML using BeautifulSoup."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove unwanted elements (e.g., scripts, styles)
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()

    text = " ".join(soup.stripped_strings)  # Extract visible text
    return text

def find_links(html, base_url):
    """Find internal links to crawl."""
    soup = BeautifulSoup(html, "html.parser")
    links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/") or base_url in href:
            full_url = href if base_url in href else base_url + href
            links.add(full_url)
    return links

def scrape_website():
    """Main function to scrape the website."""
    scraped_data = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)  # Set to False for debugging
        queue = START_URLS.copy()

        while queue:
            url = queue.pop(0)
            if url in SCRAPED_PAGES:
                continue

            print(f"Scraping: {url}")
            try:
                html = get_page_content(url, browser)
                text = extract_text(html)
                scraped_data.append({"url": url, "text": text})
                SCRAPED_PAGES.add(url)

                # Find new links to scrape
                new_links = find_links(html, BASE_URL)
                queue.extend(new_links - SCRAPED_PAGES)

            except Exception as e:
                print(f"Failed to scrape {url}: {e}")

        browser.close()

    # Save extracted content as JSON
    with open("scraped_content.json", "w", encoding="utf-8") as f:
        json.dump(scraped_data, f, indent=4)

    print("Scraping complete. Data saved to scraped_content.json")

if __name__ == "__main__":
    scrape_website()
