import React from "react";
import HomeNewsWidget from "./HomeNewsWidget";
import AnnouncementsWidget from "./AnnouncementsWidget";
import FamilyCalendarWidget from "./FamilyCalendarWidget";
import FamilyPostsPreview from "./FamilyPostsPreview";

const WIDGET_H = "min-h-[480px]";

const HomePage = ({ onViewAllNews, onViewAllPosts }) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
    {/* Row 1: News (wider) + Announcements (narrower) */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
      <div className={`lg:col-span-8 ${WIDGET_H}`}>
        <HomeNewsWidget onViewAll={onViewAllNews} />
      </div>
      <div className={`lg:col-span-4 ${WIDGET_H}`}>
        <AnnouncementsWidget />
      </div>
    </div>

    {/* Row 2: Family Calendar (narrower) + Family Posts preview (wider) */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className={`lg:col-span-4 ${WIDGET_H}`}>
        <FamilyCalendarWidget />
      </div>
      <div className={`lg:col-span-8 ${WIDGET_H}`}>
        <FamilyPostsPreview onViewAll={onViewAllPosts} />
      </div>
    </div>
  </div>
);

export default HomePage;
