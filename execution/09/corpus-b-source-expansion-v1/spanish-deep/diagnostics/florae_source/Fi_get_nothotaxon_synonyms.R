# Fi_get_nothotaxon_synonyms.R
#'
#' @title Gets all the synonyms of a nothotaxon listed in 'Flora iberica'
#'
#' @description Gets all the synonyms of a nothotaxon listed in 'Flora iberica', reading from http://www.floraiberica.es.
#'
#' @param hybrid_formula A `character` with a hybrid formula (i.e. a hybrid taxon name).
#'
#' @details This function reads from http://www.floraiberica.es and and retrieves all the synonyms of the given nothotaxon, if present.
#'
#' @return A `list` with two components. The first component ('synonyms') is a `matrix` with the found synonyms and some 'Flora iberica' fields, or is `NULL` if no names are found in Flora iberica' (e.g. genus not accepted in 'Flora iberica' (e.g. a synonym), is mistyped or out of 'Flora iberica' scope, or belongs to a not yet published genus). A second component ('message') gives further information to the user.
#'
#' @author Tiago Monteiro-Henriques. E-mail: \email{tmh.dev@@icloud.com}.
#'
#' @export
#'
Fi_get_nothotaxon_synonyms <- function (hybrid_formula) {
  if (is.null(hybrid_formula)) {stop("Argument hybrid_formula can not be NULL.")}

  #tests if the nothotaxon is listed in Fi
  hybrid_formula_mod <- gsub(" ", "+", hybrid_formula)
  Fi_result_syn <- readLines(paste0("http://www.floraiberica.es/PHP/cientificos2.php?paren=", hybrid_formula_mod), encoding="latin1", warn=FALSE) #For now "latin1" encoding seems appropriate. #As the genus is abbreviated in the hybrid_formula, it is possible that rare cases require also the genus. Not implemented for now.
  i <- grep("<TD><br /><b><i>", Fi_result_syn) #finds index of element with names (synonyms) #NOT SURE THAT THIS WORK ALWAYS!
  if (length(i)==0) { #Attention: if last insstruction fails, the hybrid formula might be present.
    return(list(synonyms=NULL, message="Nothotaxon not listed in Fi, or is mistyped, or is out of the Fi scope. Parent names should be in alphabetical order."))
  }
  temp1 <- clean_stuff(Fi_result_syn[i], stuff = c("<([^<>]*)>", "&nbsp;", "\t"))
  temp2 <- clean_whitespaces(temp1)
  if (identical(hybrid_formula, temp2)) {
    j <- grep("font color=.*><i>", Fi_result_syn) #finds index of element with names (synonyms)
    if (length(j)==0) {return(list(synonyms=NULL, message="No synonyms found."))} #Attention: Genus not published yet never show synonyms in Fi and will return NULL.
    temp3 <- strsplit(Fi_result_syn[j], "<br>")
    temp4 <- lapply(temp3, gsub, pattern="<b><i> </b></i>", replacement="") #SUBSTITUIR "<b><i> </b></i>" por ""
    temp5 <- lapply(temp4, gsub, pattern="<i> </i>", replacement="") #SUBSTITUIR "<i> </i>" por ""
    temp6 <- lapply(temp5[[1]], aux_f_synon)
    temp7 <- temp6[!sapply(temp6, is.null)]
    res <- t(sapply(temp7, function (x) {t(x)}))
    colnames(res) <- c("name", "authority", "reference", "status")
    return(list(synonyms=res, message="Successful."))
  } else {stop("Something unexpected happened, please check code.")}
}
