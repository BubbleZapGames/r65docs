/**
 * Ejected from @docusaurus/theme-classic 3.9.2 (BlogListPage).
 *
 * R65 change: passes a black header band to BlogLayout's `hero` slot.
 */
import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {
  PageMetadata,
  HtmlClassNameProvider,
  ThemeClassNames,
} from '@docusaurus/theme-common';
import BlogLayout from '@theme/BlogLayout';
import BlogListPaginator from '@theme/BlogListPaginator';
import SearchMetadata from '@theme/SearchMetadata';
import BlogPostItems from '@theme/BlogPostItems';
import BlogListPageStructuredData from '@theme/BlogListPage/StructuredData';
import styles from './styles.module.css';

function BlogListPageMetadata(props) {
  const {metadata} = props;
  const {
    siteConfig: {title: siteTitle},
  } = useDocusaurusContext();
  const {blogDescription, blogTitle, permalink} = metadata;
  const isBlogOnlyMode = permalink === '/';
  const title = isBlogOnlyMode ? siteTitle : blogTitle;
  return (
    <>
      <PageMetadata title={title} description={blogDescription} />
      <SearchMetadata tag="blog_posts_list" />
    </>
  );
}

function BlogHero({metadata}) {
  return (
    <header className={styles.hero}>
      <div className="container">
        <span className={clsx('pixel-label', styles.label)}>R65 · Devlog</span>
        <h1 className={styles.title}>{metadata.blogTitle}</h1>
        <p className={styles.sub}>{metadata.blogDescription}</p>
        <div className={styles.links}>
          <a className={styles.pill} href="/news/rss.xml">RSS</a>
          <a className={styles.pill} href="/news/atom.xml">Atom</a>
          <Link className={styles.pill} to="/news/archive">Archive</Link>
        </div>
      </div>
    </header>
  );
}

function BlogListPageContent(props) {
  const {metadata, items, sidebar} = props;
  return (
    <BlogLayout sidebar={sidebar} hero={<BlogHero metadata={metadata} />}>
      <BlogPostItems items={items} />
      <BlogListPaginator metadata={metadata} />
    </BlogLayout>
  );
}

export default function BlogListPage(props) {
  return (
    <HtmlClassNameProvider
      className={clsx(
        ThemeClassNames.wrapper.blogPages,
        ThemeClassNames.page.blogListPage,
      )}>
      <BlogListPageMetadata {...props} />
      <BlogListPageStructuredData {...props} />
      <BlogListPageContent {...props} />
    </HtmlClassNameProvider>
  );
}
