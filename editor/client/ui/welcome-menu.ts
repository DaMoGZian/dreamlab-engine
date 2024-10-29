import {
  Box,
  GitCompareArrows,
  ScrollText,
  Folder,
  Sliders,
  Terminal,
  icon,
} from "../_icons.ts";

export class WelcomeMenu {
  private welcomeCard: HTMLElement | null = null;

  show(uiRoot: HTMLElement, worldId: string): void {
    const storageKey = `@dreamlab_welcomeCardDismissed_${worldId}`;
    const isDismissed = localStorage.getItem(storageKey);
    if (isDismissed) {
      return;
    }

    this.welcomeCard = document.createElement("div");
    this.welcomeCard.className = "welcome-card";

    const closeButton = document.createElement("button");
    closeButton.className = "welcome-card-close-button";
    closeButton.innerHTML = "&times;";
    closeButton.title = "Close";

    closeButton.addEventListener("click", () => {
      this.hide();
      localStorage.setItem(storageKey, "true");
    });

    this.welcomeCard.appendChild(closeButton);

    const header = document.createElement("div");
    header.className = "welcome-card-header";

    const titleElement = document.createElement("h3");
    titleElement.className = "welcome-card-title";
    titleElement.textContent = "Welcome to the Editor!";

    header.appendChild(titleElement);

    const content = document.createElement("div");
    content.className = "welcome-card-content";

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "welcome-card-content-wrapper";

    const navSection = document.createElement("div");
    navSection.className = "welcome-card-section";

    const navHeader = document.createElement("h3");
    navHeader.className = "welcome-card-section-header";
    navHeader.textContent = "Explore the Editor";

    const navDescription = document.createElement("p");
    navDescription.textContent =
      "Navigate through different views to build, script, and manage your game. To switch views, use the buttons at the top left of the editor.";

    const navButtonsContainer = document.createElement("div");
    navButtonsContainer.className = "welcome-buttons-container";

    const navButtons = [
      {
        iconSvg: Box,
        label: "Game Editor",
        description: "Craft and design your game worlds.",
      },
      {
        iconSvg: ScrollText,
        label: "Script Editor",
        description: "Write and manage game logic.",
      },
      {
        iconSvg: GitCompareArrows,
        label: "Source Control",
        description: "Version control.",
      },
    ];

    navButtons.forEach(button => {
      const buttonElement = document.createElement("div");
      buttonElement.className = "welcome-button";

      const iconElement = icon(button.iconSvg);
      iconElement.classList.add("welcome-button-icon");

      const labelElement = document.createElement("div");
      labelElement.className = "welcome-button-label";
      labelElement.textContent = button.label;

      const tooltip = document.createElement("div");
      tooltip.className = "welcome-button-tooltip";
      tooltip.textContent = button.description;

      buttonElement.appendChild(iconElement);
      buttonElement.appendChild(labelElement);
      buttonElement.appendChild(tooltip);

      navButtonsContainer.appendChild(buttonElement);
    });

    navSection.appendChild(navHeader);
    navSection.appendChild(navDescription);
    navSection.appendChild(navButtonsContainer);

    const sidebarsSection = document.createElement("div");
    sidebarsSection.className = "welcome-card-section small-text";

    const sidebarsHeader = document.createElement("h3");
    sidebarsHeader.className = "welcome-card-section-header";
    sidebarsHeader.textContent = "Your Toolset";

    const leftSidebar = this.createSidebarInfo(Folder, "Left Sidebar", [
      "Access your project files with the Project panel.",
      "Manage game objects in the Scene Graph panel.",
    ]);

    const rightSidebar = this.createSidebarInfo(Sliders, "Right Sidebar", [
      "Adjust properties of selected objects.",
      "Add or modify entity behaviors.",
    ]);

    const bottomPanel = this.createSidebarInfo(Terminal, "Bottom Panel", [
      "Monitor logs in real-time with the Logs panel.",
      "Debug your game efficiently.",
    ]);

    sidebarsSection.appendChild(sidebarsHeader);
    sidebarsSection.appendChild(leftSidebar);
    sidebarsSection.appendChild(rightSidebar);
    sidebarsSection.appendChild(bottomPanel);

    contentWrapper.appendChild(navSection);
    contentWrapper.appendChild(sidebarsSection);

    content.appendChild(contentWrapper);

    this.welcomeCard.appendChild(header);
    this.welcomeCard.appendChild(content);

    uiRoot.appendChild(this.welcomeCard);
  }

  private createSidebarInfo(iconSvg: string, titleText: string, items: string[]): HTMLElement {
    const sidebar = document.createElement("div");
    sidebar.className = "sidebar-info";

    const iconElement = icon(iconSvg);
    iconElement.classList.add("sidebar-icon");

    const content = document.createElement("div");
    content.className = "sidebar-content";

    const title = document.createElement("h4");
    title.textContent = titleText;

    const list = document.createElement("ul");

    items.forEach(item => {
      const listItem = document.createElement("li");
      listItem.innerHTML = item;
      list.appendChild(listItem);
    });

    content.appendChild(title);
    content.appendChild(list);

    sidebar.appendChild(iconElement);
    sidebar.appendChild(content);

    return sidebar;
  }

  hide(): void {
    if (this.welcomeCard) {
      this.welcomeCard.remove();
      this.welcomeCard = null;
    }
  }
}
