class ResponsibleTippingFinder {
    constructor() {
        this.projects = [];
        this.filteredProjects = [];
        this.init();
    }

    async init() {
        await this.loadProjects();
        this.renderProjects();
        this.setupEventListeners();
    }

    async loadProjects() {
        try {
            // Get trending projects
            const response = await fetch('/api/v1/feed/trending?limit=50');
            const data = await response.json();
            
            this.projects = data.feed.data;
            console.log(`Loaded ${this.projects.length} projects`);

            // Filter projects based on criteria
            await this.filterDeservingProjects();
            
        } catch (error) {
            console.error('Error loading projects:', error);
            // Fallback to search if trending fails
            await this.loadFromSearch();
        }
    }

    async loadFromSearch() {
        try {
            // Search for various creative terms to find diverse projects
            const searchTerms = ['game', 'art', 'tool', 'creative', 'portfolio', 'demo', 'experiment'];
            const allProjects = [];
            
            for (const term of searchTerms) {
                const response = await fetch(`/api/v1/feed/search/newest/${term}?limit=20`);
                const data = await response.json();
                allProjects.push(...data.feed.data);
            }
            
            this.projects = allProjects;
            await this.filterDeservingProjects();
            
        } catch (error) {
            console.error('Error loading from search:', error);
        }
    }

    async filterDeservingProjects() {
        let filteredProjects = [];
        let attemptCount = 0;
        
        // Try progressively looser filters until we find projects
        while (filteredProjects.length === 0 && attemptCount < 3) {
            filteredProjects = [];
            
            for (const projectData of this.projects) {
                if (await this.isDeservingProject(projectData, attemptCount)) {
                    filteredProjects.push(projectData);
                }
            }
            
            attemptCount++;
            
            // If still no results, try loading more projects
            if (filteredProjects.length === 0 && attemptCount < 3) {
                console.log(`Attempt ${attemptCount}: No projects found, expanding search...`);
                await this.expandSearch();
            }
        }
        
        // Remove duplicates and limit results
        this.filteredProjects = this.removeDuplicates(filteredProjects).slice(0, 12);
        console.log(`Filtered to ${this.filteredProjects.length} deserving projects after ${attemptCount} attempts`);
    }

    async expandSearch() {
        try {
            // Add more search terms for creative projects
            const additionalTerms = ['design', 'simulator', 'fun', 'interactive', 'visual', 'cool', 'amazing', 'awesome'];
            const additionalProjects = [];
            
            for (const term of additionalTerms) {
                const response = await fetch(`/api/v1/feed/search/best/${term}?limit=25`);
                const data = await response.json();
                additionalProjects.push(...data.feed.data);
            }
            
            // Also try getting more from trending with different parameters
            const trendingResponse = await fetch('/api/v1/feed/trending?limit=100&feed=hot');
            const trendingData = await trendingResponse.json();
            additionalProjects.push(...trendingData.feed.data);
            
            this.projects = [...this.projects, ...additionalProjects];
            console.log(`Expanded search to ${this.projects.length} total projects`);
            
        } catch (error) {
            console.error('Error expanding search:', error);
        }
    }

    async isDeservingProject(projectData, filterLevel = 0) {
        const { project, site } = projectData;
        
        if (!project || !site) return false;
        
        // Skip if no title or deleted
        if (!project.title || project.deleted_at) return false;
        
        const title = (project.title || '').toLowerCase();
        const description = (project.description || '').toLowerCase();
        
        // Progressively looser bad keyword filtering
        let badKeywords = [];
        
        if (filterLevel === 0) {
            // Strict filter - only obvious gambling/begging
            badKeywords = [
                'gamble', 'gambling', 'bet', 'betting', 'casino', 'lottery', 
                'jackpot', 'prize money', 'win money', 'pay me now', 'donate money',
                'tip to win', 'tip me please', 'send tips', 'give me credits'
            ];
        } else if (filterLevel === 1) {
            // Moderate filter - only clear gambling terms
            badKeywords = [
                'gamble', 'gambling', 'casino', 'lottery', 'jackpot',
                'tip to win', 'bet money'
            ];
        } else {
            // Loose filter - only obvious scams
            badKeywords = ['scam', 'free money', 'guaranteed win'];
        }
        
        // Check if project contains bad keywords
        const containsBadKeywords = badKeywords.some(keyword => 
            title.includes(keyword) || description.includes(keyword)
        );
        
        if (containsBadKeywords) return false;
        
        // Look for quality indicators with progressively looser criteria
        const stats = project.stats || {};
        const views = stats.views || 0;
        const comments = stats.comments || 0;
        const likes = stats.likes || 0;
        
        // Progressively looser filtering criteria
        if (filterLevel === 0) {
            // Original strict criteria
            const commentToViewRatio = views > 0 ? comments / views : 0;
            return views > 10 && 
                   views < 10000 && 
                   comments < 50 && 
                   commentToViewRatio < 0.1 && 
                   title.length > 3 && 
                   this.seemsLikeQualityProject(title, description);
        } else if (filterLevel === 1) {
            // Moderate criteria
            return views > 5 && 
                   views < 50000 && 
                   comments < 100 && 
                   likes < 200 &&
                   title.length > 2 && 
                   this.seemsLikeQualityProject(title, description, true);
        } else {
            // Loose criteria - just needs to not be obvious garbage
            return views > 0 && 
                   title.length > 2 && 
                   (this.seemsLikeQualityProject(title, description, true) || 
                    views > 50); // High views indicate some quality
        }
    }

    seemsLikeQualityProject(title, description, relaxed = false) {
        // Look for indicators of quality/effort
        const qualityKeywords = [
            'game', 'art', 'tool', 'portfolio', 'demo', 'experiment', 'creative',
            'interactive', 'animation', 'music', 'sound', 'design', 'code',
            'learn', 'tutorial', 'educational', 'simulation', 'visualization',
            'generator', 'calculator', 'dashboard', 'app', 'website', 'blog',
            'fun', 'cool', 'awesome', 'amazing', 'beautiful', 'simple', 'useful'
        ];
        
        const text = title + ' ' + description;
        
        const hasQualityKeyword = qualityKeywords.some(keyword => text.includes(keyword));
        const hasDecentTitle = title.length > (relaxed ? 5 : 10);
        
        if (relaxed) {
            // More lenient - just needs decent length or quality keyword
            return hasQualityKeyword || hasDecentTitle;
        } else {
            // Original criteria
            return hasQualityKeyword || hasDecentTitle;
        }
    }

    removeDuplicates(projects) {
        const seen = new Set();
        return projects.filter(projectData => {
            const id = projectData.project?.id;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    renderProjects() {
        const loadingScreen = document.getElementById('loading-screen');
        const showcase = document.getElementById('project-showcase');
        const grid = document.getElementById('project-grid');
        const stats = document.getElementById('filter-stats');
        
        // Hide loading screen
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            showcase.style.display = 'block';
        }, 2000);
        
        // Update stats with more encouraging message
        if (this.filteredProjects.length > 0) {
            stats.textContent = `Found ${this.filteredProjects.length} deserving projects out of ${this.projects.length} scanned`;
        } else {
            stats.textContent = `Still searching for deserving projects... scanned ${this.projects.length} so far`;
        }
        
        // Clear grid
        grid.innerHTML = '';
        
        if (this.filteredProjects.length === 0) {
            // Show message if no projects found
            const message = document.createElement('div');
            message.className = 'no-projects-message';
            message.innerHTML = `
                <h3>🔍 Still Searching...</h3>
                <p>We're being very selective to find truly deserving projects.</p>
                <p>Click "Find More" to expand the search!</p>
            `;
            grid.appendChild(message);
        } else {
            // Render projects
            this.filteredProjects.forEach(projectData => {
                const card = this.createProjectCard(projectData);
                grid.appendChild(card);
            });
        }
    }

    createProjectCard(projectData) {
        const { project, site } = projectData;
        const stats = project.stats || {};
        
        const card = document.createElement('div');
        card.className = 'project-card';
        
        // Generate thumbnail URL
        const thumbnailUrl = site ? `https://images.websim.com/v1/site/${site.id}/600` : '';
        
        card.innerHTML = `
            <img src="${thumbnailUrl}" alt="Project thumbnail" class="project-thumbnail" 
                 onerror="this.style.display='none'">
            <div class="project-title">${project.title || 'Untitled Project'}</div>
            <div class="project-creator">
                <img src="https://images.websim.com/avatar/${project.created_by?.username || 'anonymous'}" 
                     alt="Creator" class="creator-avatar" onerror="this.style.display='none'">
                <span>@${project.created_by?.username || 'anonymous'}</span>
            </div>
            <div class="project-stats">
                <span>👀 ${stats.views || 0} views</span>
                <span>💬 ${stats.comments || 0} comments</span>
                <span>❤️ ${stats.likes || 0} likes</span>
            </div>
            <div class="support-reason">
                ${this.getSupportReason(stats)}
            </div>
        `;
        
        card.addEventListener('click', () => {
            this.openProject(site, project);
        });
        
        return card;
    }

    getSupportReason(stats) {
        const views = stats.views || 0;
        const comments = stats.comments || 0;
        const likes = stats.likes || 0;
        
        if (views > 1000 && comments < 10) {
            return "🎯 High views, low engagement - needs appreciation!";
        } else if (likes < 10) {
            return "💎 Hidden gem - deserves more recognition!";
        } else if (comments === 0) {
            return "💬 No comments yet - be the first to show support!";
        } else {
            return "⭐ Quality project with room for more support!";
        }
    }

    openProject(site, project) {
        const iframe = document.getElementById('fullscreen-iframe');
        const frame = document.getElementById('project-frame');
        const title = document.querySelector('.iframe-title');
        
        if (site) {
            frame.src = `https://websim.com/c/${site.id}`;
            title.textContent = project.title || 'Untitled Project';
            iframe.style.display = 'block';
        }
    }

    setupEventListeners() {
        const backBtn = document.getElementById('back-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        const iframe = document.getElementById('fullscreen-iframe');
        
        backBtn.addEventListener('click', () => {
            iframe.style.display = 'none';
            document.getElementById('project-frame').src = '';
        });
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.textContent = '🔄 Scanning...';
            refreshBtn.disabled = true;
            
            await this.loadProjects();
            this.renderProjects();
            
            refreshBtn.textContent = '🔄 Find More Deserving Projects';
            refreshBtn.disabled = false;
        });
        
        // Close iframe with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && iframe.style.display !== 'none') {
                iframe.style.display = 'none';
                document.getElementById('project-frame').src = '';
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ResponsibleTippingFinder();
});