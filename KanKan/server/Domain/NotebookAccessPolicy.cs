using KanKan.API.Models.Entities;

namespace KanKan.API.Domain;

public static class NotebookAccessPolicy
{
    /// <summary>
    /// Can view if: owner, OR explicit viewer/editor in NotebookVisibility.
    /// </summary>
    public static bool CanViewNotebook(IConfiguration config, User user, Notebook notebook, NotebookVisibility? visibility)
    {
        if (notebook.OwnerId == user.Id) return true;
        return HasExplicitViewerAccess(user, visibility);
    }

    /// <summary>
    /// Can edit if: owner, OR explicit editor in NotebookVisibility.
    /// </summary>
    public static bool CanEditNotebook(IConfiguration config, User user, Notebook notebook, NotebookVisibility? visibility)
    {
        if (notebook.OwnerId == user.Id) return true;
        return HasExplicitEditorAccess(user, visibility);
    }

    public static bool CanManageNotebook(User user, Notebook notebook)
    {
        return notebook.OwnerId == user.Id;
    }

    private static bool HasExplicitViewerAccess(User user, NotebookVisibility? visibility)
    {
        if (visibility == null) return false;
        var email = FamilyAccessPolicy.NormalizeEmail(user.Email);
        var domain = FamilyAccessPolicy.ResolveDomain(user);

        if (visibility.UserViewers.Any(e => string.Equals(e, email, StringComparison.OrdinalIgnoreCase))) return true;
        if (visibility.UserEditors.Any(e => string.Equals(e, email, StringComparison.OrdinalIgnoreCase))) return true;
        if (visibility.DomainViewers.Any(d => string.Equals(d, domain, StringComparison.OrdinalIgnoreCase))) return true;
        if (visibility.DomainEditors.Any(d => string.Equals(d, domain, StringComparison.OrdinalIgnoreCase))) return true;
        return false;
    }

    private static bool HasExplicitEditorAccess(User user, NotebookVisibility? visibility)
    {
        if (visibility == null) return false;
        var email = FamilyAccessPolicy.NormalizeEmail(user.Email);
        var domain = FamilyAccessPolicy.ResolveDomain(user);

        if (visibility.UserEditors.Any(e => string.Equals(e, email, StringComparison.OrdinalIgnoreCase))) return true;
        if (visibility.DomainEditors.Any(d => string.Equals(d, domain, StringComparison.OrdinalIgnoreCase))) return true;
        return false;
    }
}
